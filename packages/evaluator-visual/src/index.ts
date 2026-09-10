import { createHash, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export interface Viewport { name: string; width: number; height: number }
export interface DecodedPng { width: number; height: number; /** Always RGBA, 4 bytes per pixel. */ rgba: Uint8Array }
export interface ImageComparison { compared: boolean; mismatch: number; score: number; width: number; height: number }
export interface VisualEvaluatorInput {
  port: number; viewports: Viewport[]; locale?: string; timezone?: string;
  /** viewport name -> baseline PNG bytes, undefined if missing */
  baselines: Record<string, Buffer | undefined>;
  /** default 0.05 */
  mismatchThreshold?: number;
  run(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_PNG_BYTES = 4 * 1024 * 1024;
const LOG_LIMIT = 65536;

/** Minimal pure-Node PNG decoder: 8-bit RGB (2) / RGBA (6), non-interlaced, all 5 filter types. Throws on anything else. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("PNG: bad signature");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8; let width = 0; let height = 0; let colorType = -1; let bitDepth = 0; let interlace = 0; const idat: Uint8Array[] = []; let sawEnd = false;
  while (offset + 8 <= bytes.length && !sawEnd) {
    const length = view.getUint32(offset); const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)); const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > bytes.length) throw new Error("PNG: truncated chunk");
    if (type === "IHDR") { width = view.getUint32(offset + 8); height = view.getUint32(offset + 12); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; if (data[10] !== 0 || data[11] !== 0) throw new Error("PNG: unsupported compression/filter method"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") sawEnd = true;
    offset += 12 + length;
  }
  if (width <= 0 || height <= 0) throw new Error("PNG: missing IHDR");
  if (bitDepth !== 8) throw new Error(`PNG: unsupported bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`PNG: unsupported colour type ${colorType}`);
  if (interlace !== 0) throw new Error("PNG: interlaced images are unsupported");
  const bpp = colorType === 6 ? 4 : 3; const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
  if (raw.length < (stride + 1) * height) throw new Error("PNG: inflated data too short");
  const rgba = new Uint8Array(width * height * 4); const prev = new Uint8Array(stride); const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1); const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const v = raw[rowStart + 1 + x]; const a = x >= bpp ? cur[x - bpp] : 0; const b = prev[x]; const c = x >= bpp ? prev[x - bpp] : 0; let out: number;
      switch (filter) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + b; break;
        case 3: out = v + ((a + b) >> 1); break;
        case 4: { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error(`PNG: unknown filter type ${filter}`);
      }
      cur[x] = out & 0xff;
    }
    for (let px = 0; px < width; px++) { const s = px * bpp; const d = (y * width + px) * 4; rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2]; rgba[d + 3] = bpp === 4 ? cur[s + 3] : 255; }
    prev.set(cur);
  }
  return { width, height, rgba };
}

/** Dimension mismatch -> mismatch 1. Otherwise mismatch = fraction of pixels whose max channel delta > 16. score = 1 - clamp(mismatch/threshold, 0, 1). */
export function compareImages(actual: DecodedPng, baseline: DecodedPng, threshold = 0.05): ImageComparison {
  let mismatch: number;
  if (actual.width !== baseline.width || actual.height !== baseline.height) mismatch = 1;
  else {
    const total = actual.width * actual.height; let differing = 0;
    for (let i = 0; i < total; i++) { const o = i * 4; let max = 0; for (let ch = 0; ch < 4; ch++) { const d = Math.abs(actual.rgba[o + ch] - baseline.rgba[o + ch]); if (d > max) max = d; } if (max > 16) differing++; }
    mismatch = total ? differing / total : 0;
  }
  const score = threshold > 0 ? 1 - Math.min(1, Math.max(0, mismatch / threshold)) : mismatch === 0 ? 1 : 0;
  return { compared: true, mismatch, score, width: actual.width, height: actual.height };
}

type Shot = { viewport: string; width: number; height: number; pngBase64: string; geometry: unknown[]; oversized?: boolean };
const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const stripPng = (s: string) => s.replace(/"pngBase64":"[^"]*"/g, '"pngBase64":"<stripped>"');
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export class VisualEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: VisualEvaluatorInput) {}
  metadata() { return { id: "visual", version: "1", stage: "visual", prerequisites: ["start"], deterministic: true }; }
  async prepare() {}
  async cleanup() {}

  buildScript(): string {
    const { port, viewports, locale, timezone } = this.input;
    const cfg = JSON.stringify({ port, viewports, locale: locale ?? "en-US", timezone: timezone ?? "UTC", maxBytes: MAX_PNG_BYTES });
    return `const cfg=${cfg};(async()=>{const {chromium}=require('playwright-core');const b=await chromium.launch({headless:true});const shots=[];for(const vp of cfg.viewports){const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:1,locale:cfg.locale,timezoneId:cfg.timezone,reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(5000);p.setDefaultNavigationTimeout(15000);let png=Buffer.alloc(0);let geometry=[];try{await p.goto('http://app:'+cfg.port+'/',{waitUntil:'networkidle'});await p.addStyleTag({content:'*{animation:none!important;transition:none!important;caret-color:transparent!important}'});await p.evaluate(()=>document.fonts.ready);png=await p.screenshot({fullPage:true,type:'png'});geometry=await p.evaluate(()=>[...document.querySelectorAll('[data-testid]')].map(e=>{const r=e.getBoundingClientRect().toJSON();const o={testId:e.dataset.testid};for(const k of Object.keys(r))o[k]=Math.round(r[k]);return o}))}catch(e){process.stderr.write('viewport '+vp.name+' failed: '+(e&&e.message||e)+'\\n')}const oversized=png.length>cfg.maxBytes;shots.push({viewport:vp.name,width:vp.width,height:vp.height,pngBase64:oversized?'':png.toString('base64'),geometry,oversized});await ctx.close()}await b.close();process.stdout.write(JSON.stringify({shots})+'\\n')})().catch(e=>{process.stderr.write(String(e&&e.stack||e));process.exit(1)});`;
  }

  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:visual`;
    const threshold = this.input.mismatchThreshold ?? 0.05;
    const raw = await this.input.run(this.buildScript());
    let shots: Shot[] = [];
    try {
      const line = raw.stdout.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => l.startsWith("{"));
      const value = line ? JSON.parse(line) : undefined;
      if (Array.isArray(value?.shots)) shots = value.shots.filter((s: unknown): s is Shot => typeof (s as Shot)?.viewport === "string" && typeof (s as Shot)?.pngBase64 === "string");
    } catch {}
    const evidenceRefs: string[] = []; const stage = (input: { logicalType: string; mime: string; relativePath: string; content: string }) => { evidenceRefs.push(context.stageArtifact({ ...input, producerRef })); };
    const scores: number[] = []; let anyBaseline = false; const notes: string[] = [];
    for (const vp of this.input.viewports) {
      const shot = shots.find((s) => s.viewport === vp.name);
      const baselineBytes = this.input.baselines[vp.name]; if (baselineBytes) anyBaseline = true;
      let actual: DecodedPng | undefined; let pngBytes: Uint8Array | undefined;
      if (shot && shot.pngBase64 && !shot.oversized) { try { pngBytes = Buffer.from(shot.pngBase64, "base64"); actual = decodePng(pngBytes); } catch (error) { notes.push(`${vp.name}: ${error instanceof Error ? error.message : "undecodable screenshot"}`); } }
      else if (shot?.oversized) notes.push(`${vp.name}: screenshot exceeded ${MAX_PNG_BYTES} bytes`);
      else notes.push(`${vp.name}: screenshot missing`);
      stage({ logicalType: "visual_screenshot", mime: "application/json", relativePath: `screenshots/${vp.name}.png.json`, content: JSON.stringify({ encoding: "base64-png", width: actual?.width ?? shot?.width ?? vp.width, height: actual?.height ?? shot?.height ?? vp.height, sha256: pngBytes ? sha256(pngBytes) : null, pngBase64: pngBytes ? shot!.pngBase64 : "", oversized: !!shot?.oversized }) });
      stage({ logicalType: "visual_geometry", mime: "application/json", relativePath: `visual/${vp.name}.geometry.json`, content: JSON.stringify({ viewport: vp.name, elements: Array.isArray(shot?.geometry) ? shot!.geometry : [] }) });
      let diff: ImageComparison & { baselineSha256?: string } = { compared: false, mismatch: 1, score: 0, width: actual?.width ?? 0, height: actual?.height ?? 0 };
      if (baselineBytes) {
        let baseline: DecodedPng | undefined; try { baseline = decodePng(baselineBytes); } catch (error) { notes.push(`${vp.name}: baseline undecodable (${error instanceof Error ? error.message : "unknown"})`); }
        if (baseline && actual) diff = { ...compareImages(actual, baseline, threshold), baselineSha256: sha256(baselineBytes) };
        else diff = { ...diff, baselineSha256: sha256(baselineBytes) };
        scores.push(diff.score);
      }
      stage({ logicalType: "visual_diff", mime: "application/json", relativePath: `visual/${vp.name}.diff.json`, content: JSON.stringify(diff) });
    }
    stage({ logicalType: "playwright_log", mime: "text/plain", relativePath: "visual/playwright.log", content: `${stripPng(raw.stdout).slice(0, LOG_LIMIT)}${raw.stderr.slice(0, LOG_LIMIT)}`.slice(0, LOG_LIMIT) });
    const base = { schemaVersion: 1 as const, evaluatorResultId: randomUUID(), evaluatorId: "visual", evaluatorVersion: "1", attemptId: context.attemptId, stage: "visual", prerequisites: ["start"], deterministic: true, evaluatedSnapshotDigest: context.snapshotDigest, producerRef, evidenceRefs: [...new Set(evidenceRefs)] };
    if (!anyBaseline) return { ...base, status: "skipped", outcome: { passed: false, privateCode: "VISUAL_BASELINE_MISSING", summary: "No visual baseline is available for any viewport" } };
    const score = clamp01(scores.reduce((a, b) => a + b, 0) / scores.length);
    const passed = raw.exitCode === 0 && scores.every((s) => s >= 0.5);
    const summary = (passed ? "Visual comparison passed" : `Visual comparison failed${raw.exitCode !== 0 ? " (playwright exited non-zero)" : ""}`) + (notes.length ? `: ${notes.join("; ")}` : "");
    return { ...base, status: passed ? "passed" : "failed", outcome: { passed, privateCode: passed ? "VISUAL_PASSED" : "VISUAL_MISMATCH", summary: summary.slice(0, 500), score } };
  }
}

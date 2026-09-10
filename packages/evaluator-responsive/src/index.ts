import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export type Viewport = { name: string; width: number; height: number };
export type ElementMeasurement = { testId: string; x: number; y: number; width: number; height: number; right: number; visible: boolean; empty?: boolean };
export type ViewportMeasurement = { viewport: string; width: number; height: number; innerWidth: number; docScrollWidth: number; bodyScrollWidth: number; elements: ElementMeasurement[] };
export type ResponsiveCheck = { id: string; passed: boolean; detail?: string };

const OVERFLOW_CHECKS = new Set(["no-horizontal-overflow", "no-element-beyond-right-edge"]);
const LOG_LIMIT = 65536;

/** Pure host-side checks for one viewport measurement. */
export function evaluateMeasurements(measurement: ViewportMeasurement): { checks: ResponsiveCheck[] } {
  const limit = measurement.innerWidth + 1;
  const visible = measurement.elements.filter((e) => e.visible);
  const overflow = measurement.docScrollWidth <= limit && measurement.bodyScrollWidth <= limit;
  const beyond = visible.filter((e) => e.right > limit);
  // Empty status/live regions are legitimately 0px tall until they receive content; only elements with content count.
  const zero = visible.filter((e) => !(e.width > 0 && e.height > 0) && !e.empty);
  return { checks: [
    { id: "no-horizontal-overflow", passed: overflow, detail: overflow ? undefined : `docScrollWidth=${measurement.docScrollWidth} bodyScrollWidth=${measurement.bodyScrollWidth} innerWidth=${measurement.innerWidth}` },
    { id: "no-element-beyond-right-edge", passed: beyond.length === 0, detail: beyond.length ? `beyond right edge: ${beyond.map((e) => `${e.testId}(right=${e.right})`).join(", ")}` : undefined },
    { id: "no-zero-size-visible-testids", passed: zero.length === 0, detail: zero.length ? `zero-size: ${zero.map((e) => `${e.testId}(${e.width}x${e.height})`).join(", ")}` : undefined },
  ] };
}

function isNumber(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function parseMeasurements(stdout: string): ViewportMeasurement[] | null {
  try {
    const value = JSON.parse(stdout);
    if (!Array.isArray(value?.measurements)) return null;
    const out: ViewportMeasurement[] = [];
    for (const m of value.measurements) {
      if (typeof m?.viewport !== "string" || !isNumber(m.width) || !isNumber(m.height) || !isNumber(m.innerWidth) || !isNumber(m.docScrollWidth) || !isNumber(m.bodyScrollWidth) || !Array.isArray(m.elements)) return null;
      const elements: ElementMeasurement[] = [];
      for (const e of m.elements) {
        if (typeof e?.testId !== "string" || !isNumber(e.x) || !isNumber(e.y) || !isNumber(e.width) || !isNumber(e.height) || !isNumber(e.right) || typeof e.visible !== "boolean") return null;
        elements.push({ testId: e.testId, x: e.x, y: e.y, width: e.width, height: e.height, right: e.right, visible: e.visible, empty: e.empty === true });
      }
      out.push({ viewport: m.viewport, width: m.width, height: m.height, innerWidth: m.innerWidth, docScrollWidth: m.docScrollWidth, bodyScrollWidth: m.bodyScrollWidth, elements });
    }
    return out;
  } catch { return null; }
}

// Measurement intrinsics are captured in an init script before any page code runs and bound to a non-writable,
// randomly named function; page scripts cannot redefine what the evaluator calls.
export class ResponsiveEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { port: number; viewports: Viewport[]; run(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }> }) {}
  metadata() { return { id: "responsive", version: "1", stage: "responsive", prerequisites: ["start"], deterministic: true, informational: true }; }
  async prepare() {}
  async cleanup() {}
  private script(): string {
    const viewports = JSON.stringify(this.input.viewports.map((v) => ({ name: v.name, width: v.width, height: v.height })));
    return `const viewports=${viewports}; (async()=>{const {chromium}=require('playwright-core');const b=await chromium.launch({headless:true});const measurements=[];for(const v of viewports){const c=await b.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:1});const measure='__fab_measure_'+Math.random().toString(36).slice(2);await c.addInitScript(({name})=>{const qsa=Document.prototype.querySelectorAll,rect=Element.prototype.getBoundingClientRect,gcs=window.getComputedStyle,cv=Element.prototype.checkVisibility,getAttr=Element.prototype.getAttribute,sw=Object.getOwnPropertyDescriptor(Element.prototype,'scrollWidth').get,iw=Object.getOwnPropertyDescriptor(window,'innerWidth').get,round=Math.round,from=Array.from;const fn=()=>{const elements=from.call(Array,qsa.call(document,'[data-testid]')).map((e)=>{const b=rect.call(e);const s=gcs.call(window,e);return {testId:getAttr.call(e,'data-testid')||'',x:round(b.x),y:round(b.y),width:round(b.width),height:round(b.height),right:round(b.x+b.width),visible:(typeof cv==='function'?cv.call(e,{visibilityProperty:true}):s.visibility!=='hidden'&&s.display!=='none'),empty:!e.hasChildNodes()}});return {innerWidth:iw.call(window),docScrollWidth:sw.call(document.documentElement),bodyScrollWidth:document.body?sw.call(document.body):0,elements}};Object.defineProperty(window,name,{value:fn,configurable:false,writable:false,enumerable:false})},{name:measure});const p=await c.newPage();p.setDefaultTimeout(5000);p.setDefaultNavigationTimeout(15000);await p.goto('http://app:${this.input.port}/',{waitUntil:'networkidle'});const m=await p.evaluate((name)=>window[name](),measure);measurements.push({viewport:v.name,width:v.width,height:v.height,...m});await c.close()}await b.close();process.stdout.write(JSON.stringify({measurements})+'\\n')})().catch((e)=>{process.stderr.write(String(e&&e.stack||e));process.exit(1)});`;
  }
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:responsive`;
    const base = { schemaVersion: 1 as const, evaluatorResultId: randomUUID(), evaluatorId: "responsive", evaluatorVersion: "1", attemptId: context.attemptId, stage: "responsive", prerequisites: ["start"], deterministic: true, evaluatedSnapshotDigest: context.snapshotDigest, producerRef };
    let raw: { exitCode: number; stdout: string; stderr: string };
    try { raw = await this.input.run(this.script()); } catch (error) { raw = { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }; }
    const log = context.stageArtifact({ logicalType: "playwright_log", mime: "text/plain", relativePath: "responsive/playwright.log", content: `${raw.stdout}${raw.stderr}`.slice(0, LOG_LIMIT), producerRef });
    const measurements = raw.exitCode === 0 ? parseMeasurements(raw.stdout) : null;
    if (!measurements) return { ...base, status: "failed", outcome: { passed: false, privateCode: "RESPONSIVE_MEASUREMENT_FAILED", summary: "Responsive measurement script failed or produced unparsable output", score: 0 }, evidenceRefs: [log] };
    const refs: string[] = []; let total = 0; let passed = 0; let overflow = false;
    for (const m of measurements) {
      const { checks } = evaluateMeasurements(m);
      total += checks.length; passed += checks.filter((c) => c.passed).length;
      if (checks.some((c) => !c.passed && OVERFLOW_CHECKS.has(c.id))) overflow = true;
      const safe = m.viewport.replace(/[^A-Za-z0-9._-]/g, "_") || "viewport";
      refs.push(context.stageArtifact({ logicalType: "responsive_result", mime: "application/json", relativePath: `responsive/${safe}.json`, content: JSON.stringify({ ...m, checks }), producerRef }));
    }
    const score = total ? passed / total : 0; const ok = total > 0 && score === 1;
    const privateCode = ok ? "RESPONSIVE_PASSED" : overflow ? "RESPONSIVE_OVERFLOW" : "RESPONSIVE_LAYOUT_DEFECT";
    const summary = ok ? "Layout fits all viewports" : overflow ? "Horizontal overflow detected at one or more viewports" : "Layout defects detected at one or more viewports";
    return { ...base, status: ok ? "passed" : "failed", outcome: { passed: ok, privateCode, summary, score }, evidenceRefs: [...new Set([...refs, log])] };
  }
}

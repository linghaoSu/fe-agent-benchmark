import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export type Viewport = { name: string; width: number; height: number };
export type AxeViolation = { id: string; impact: string; nodes: number; selectors: string[] };
export type AxeSummary = { violations: AxeViolation[]; passes: number };
export type BuiltinCheck = { id: string; passed: boolean; failing: number; selectors: string[] };
export type ViewportResult = { viewport: string; axe?: AxeSummary; axeError?: string; builtin: BuiltinCheck[] };
export type A11yScriptResult = { results: ViewportResult[] };
export type A11yScore = { score: number; passed: boolean; perViewport: Array<{ viewport: string; score: number; seriousOrCritical: number; checks: number }> };

const MAX_SELECTORS = 5; const MAX_SELECTOR_LENGTH = 120; const SERIOUS = new Set(["serious", "critical"]);
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const str = (v: unknown, max: number): string => String(typeof v === "string" ? v : "").slice(0, max);
const selectors = (v: unknown): string[] => (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x.length > 0).slice(0, MAX_SELECTORS).map((x) => (x as string).slice(0, MAX_SELECTOR_LENGTH));
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Re-sanitize untrusted container output into a bounded, schema-shaped structure. Returns undefined when the payload is not usable. */
export function sanitizeA11yResult(value: unknown): A11yScriptResult | undefined {
  const raw = (value as { results?: unknown } | null)?.results;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const results: ViewportResult[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    if (!entry || typeof entry.viewport !== "string" || !Array.isArray(entry.builtin)) return undefined;
    const builtin: BuiltinCheck[] = (entry.builtin as Array<Record<string, unknown>>).filter((b) => b && typeof b.id === "string").map((b) => ({ id: str(b.id, 80), passed: b.passed === true, failing: count(b.failing), selectors: selectors(b.selectors) }));
    const out: ViewportResult = { viewport: str(entry.viewport, 80), builtin };
    const axe = entry.axe as Record<string, unknown> | undefined;
    if (typeof entry.axeError === "string") out.axeError = entry.axeError.slice(0, 300);
    if (axe && typeof axe === "object") out.axe = { passes: count(axe.passes), violations: (Array.isArray(axe.violations) ? axe.violations as Array<Record<string, unknown>> : []).filter((v) => v && typeof v.id === "string").map((v) => ({ id: str(v.id, 80), impact: str(v.impact, 20), nodes: count(v.nodes), selectors: selectors(v.selectors) })) };
    results.push(out);
  }
  return { results };
}

/** Pure scoring: per viewport `1 - seriousOrCritical / max(1, checks)`, overall mean. */
export function scoreA11y(result: A11yScriptResult): A11yScore {
  const perViewport = result.results.map((vp) => {
    const violations = vp.axe?.violations ?? []; const passes = vp.axe?.passes ?? 0;
    const seriousOrCritical = violations.filter((v) => SERIOUS.has(v.impact)).length + vp.builtin.filter((b) => !b.passed).length;
    const checks = passes + violations.length + vp.builtin.length;
    return { viewport: vp.viewport, seriousOrCritical, checks, score: clamp01(1 - seriousOrCritical / Math.max(1, checks)) };
  });
  const score = perViewport.length ? clamp01(perViewport.reduce((a, b) => a + b.score, 0) / perViewport.length) : 0;
  return { score, passed: perViewport.length > 0 && perViewport.every((v) => v.seriousOrCritical === 0), perViewport };
}

// Runs inside the page. Deterministic DOM checks so the evaluator still yields signal without axe.
const BUILTIN_SOURCE = `(() => {
  const sel = (el) => { const parts = []; let n = el; while (n && n.nodeType === 1 && parts.length < 6) { let s = n.tagName.toLowerCase(); if (n.id) { s += '#' + n.id; parts.unshift(s); break; } const p = n.parentElement; if (p) { const i = Array.prototype.indexOf.call(p.children, n); s += ':nth-child(' + (i + 1) + ')'; } parts.unshift(s); n = p; } return parts.join(' > ').slice(0, ${MAX_SELECTOR_LENGTH}); };
  const check = (id, failing) => ({ id, passed: failing.length === 0, failing: failing.length, selectors: failing.slice(0, ${MAX_SELECTORS}).map(sel) });
  const visible = (el) => { if (el.hidden || el.type === 'hidden' || el.getAttribute('aria-hidden') === 'true') return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const text = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('value') || '').trim();
  const labelledBy = (el) => { const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean); return ids.some((i) => { const t = document.getElementById(i); return !!t && !!t.textContent.trim(); }); };
  const out = [];
  out.push(check('img-alt', [...document.querySelectorAll('img')].filter((img) => !(img.getAttribute('alt') || '').trim() && img.getAttribute('role') !== 'presentation' && img.getAttribute('role') !== 'none')));
  const placeholderOnly = []; const unlabeled = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!visible(el)) continue; if (['submit', 'button', 'reset', 'image'].includes(el.type) && text(el)) continue;
    const ok = (el.getAttribute('aria-label') || '').trim() || labelledBy(el) || (el.id && [...document.querySelectorAll('label[for]')].some((l) => l.getAttribute('for') === el.id && l.textContent.trim())) || (el.closest('label') && el.closest('label').textContent.trim()) || (el.getAttribute('title') || '').trim();
    if (ok) continue; if ((el.getAttribute('placeholder') || '').trim()) placeholderOnly.push(el); else unlabeled.push(el);
  }
  const labels = check('form-labels', [...unlabeled, ...placeholderOnly]);
  labels.selectors = [...unlabeled, ...placeholderOnly].slice(0, ${MAX_SELECTORS}).map((el) => (placeholderOnly.includes(el) ? '[placeholder-only] ' : '') + sel(el)).map((s) => s.slice(0, ${MAX_SELECTOR_LENGTH}));
  out.push(labels);
  out.push(check('button-name', [...document.querySelectorAll('button, [role="button"]')].filter((b) => visible(b) && !text(b) && !labelledBy(b) && !b.querySelector('img[alt]:not([alt=""])'))));
  out.push({ id: 'html-lang', passed: !!(document.documentElement.getAttribute('lang') || '').trim(), failing: (document.documentElement.getAttribute('lang') || '').trim() ? 0 : 1, selectors: (document.documentElement.getAttribute('lang') || '').trim() ? [] : ['html'] });
  out.push({ id: 'document-title', passed: !!document.title.trim(), failing: document.title.trim() ? 0 : 1, selectors: document.title.trim() ? [] : ['head > title'] });
  let prev = 0; const skipped = [];
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) { const lvl = Number(h.tagName[1]); if (prev && lvl > prev + 1) skipped.push(h); prev = lvl; }
  out.push(check('heading-order', skipped));
  return out;
})()`;

const AXE_SOURCE = `(async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, resultTypes: ['violations', 'passes'] }); return { passes: r.passes.length, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact || 'unknown', nodes: v.nodes.length, selectors: v.nodes.slice(0, ${MAX_SELECTORS}).map((n) => String(Array.isArray(n.target) ? n.target.join(' ') : n.target).slice(0, ${MAX_SELECTOR_LENGTH})) })) }; })()`;

export class A11yEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { port: number; viewports: Viewport[]; axeSource?: string; run(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }> }) {}
  metadata() { return { id: "accessibility", version: "1", stage: "accessibility", prerequisites: ["start"], deterministic: true, informational: true }; }
  async prepare() {}
  async cleanup() {}
  buildScript(): string {
    const viewports = this.input.viewports.map((v) => ({ name: String(v.name), width: Math.max(1, Math.floor(v.width)), height: Math.max(1, Math.floor(v.height)) }));
    return `const axeSource=${JSON.stringify(this.input.axeSource ?? null)};const viewports=${JSON.stringify(viewports)};(async()=>{const {chromium}=require('playwright-core');const b=await chromium.launch({headless:true});const results=[];try{for(const vp of viewports){const p=await b.newPage({viewport:{width:vp.width,height:vp.height}});p.setDefaultTimeout(5000);p.setDefaultNavigationTimeout(15000);await p.goto('http://app:${this.input.port}/',{waitUntil:'networkidle'});const entry={viewport:vp.name,builtin:[]};if(axeSource){try{await p.addScriptTag({content:axeSource});entry.axe=await p.evaluate(${JSON.stringify(AXE_SOURCE)});if(!entry.axe||typeof entry.axe.passes!=='number')throw new Error('axe returned no result')}catch(e){entry.axeError=String(e&&e.message||e).slice(0,300);process.stderr.write('axe failed: '+entry.axeError+'\\n')}}entry.builtin=await p.evaluate(${JSON.stringify(BUILTIN_SOURCE)});results.push(entry);await p.close()}}finally{await b.close()}process.stdout.write(JSON.stringify({results}))})().catch((e)=>{process.stderr.write(String(e&&e.stack||e));process.exit(1)});`;
  }
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:accessibility`;
    let raw = { exitCode: 1, stdout: "", stderr: "" };
    try { raw = await this.input.run(this.buildScript()); } catch (error) { raw = { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }; }
    let parsed: A11yScriptResult | undefined;
    try { parsed = raw.exitCode === 0 ? sanitizeA11yResult(JSON.parse(raw.stdout)) : undefined; } catch { parsed = undefined; }
    const evidenceRefs: string[] = [];
    const scored = parsed ? scoreA11y(parsed) : undefined;
    if (parsed && scored) for (const [index, vp] of parsed.results.entries()) {
      const name = vp.viewport.replace(/[^A-Za-z0-9_-]+/g, "_") || `viewport-${index}`;
      evidenceRefs.push(context.stageArtifact({ logicalType: "a11y_result", mime: "application/json", relativePath: `a11y/${name}.json`, content: JSON.stringify({ viewport: vp.viewport, score: scored.perViewport[index]?.score ?? 0, axe: vp.axe, builtin: vp.builtin }), producerRef }));
    }
    evidenceRefs.push(context.stageArtifact({ logicalType: "playwright_log", mime: "text/plain", relativePath: "a11y/playwright.log", content: `${raw.stdout.slice(0, 32768)}${raw.stderr.slice(0, 32768)}`, producerRef }));
    const base = { schemaVersion: 1 as const, evaluatorResultId: randomUUID(), evaluatorId: "accessibility", evaluatorVersion: "1", attemptId: context.attemptId, stage: "accessibility", prerequisites: ["start"], deterministic: true, evaluatedSnapshotDigest: context.snapshotDigest, producerRef, evidenceRefs: [...new Set(evidenceRefs)] };
    if (!scored) return { ...base, status: "failed", outcome: { passed: false, privateCode: "A11Y_MEASUREMENT_FAILED", summary: "Accessibility measurement did not produce a usable result", score: 0 } };
    // When axe was requested it must actually run; a page (strict CSP, tampered window.axe) that blocks it cannot fall through to the smaller builtin rule set and pass.
    const axeBlocked = this.input.axeSource ? parsed!.results.filter((vp) => !vp.axe) : [];
    if (axeBlocked.length) return { ...base, status: "failed", outcome: { passed: false, privateCode: "A11Y_MEASUREMENT_FAILED", summary: `axe-core did not run for ${axeBlocked.map((vp) => vp.viewport).join(", ")}: ${axeBlocked[0]!.axeError ?? "no result"}`.slice(0, 500), score: 0 } };
    const violations = scored.perViewport.reduce((a, b) => a + b.seriousOrCritical, 0);
    return { ...base, status: scored.passed ? "passed" : "failed", outcome: { passed: scored.passed, privateCode: scored.passed ? "A11Y_PASSED" : "A11Y_VIOLATIONS", summary: scored.passed ? "No serious or critical accessibility violations" : `${violations} serious/critical accessibility violation(s) across ${scored.perViewport.length} viewport(s)`, score: scored.score } };
  }
}

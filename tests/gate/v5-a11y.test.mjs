import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const a11y = new URL("../../packages/evaluator-a11y/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const axeFile = new URL("../fixtures/playwright-runtime/axe/axe.min.js", import.meta.url);
const axeReadme = new URL("../fixtures/playwright-runtime/axe/README.md", import.meta.url);

function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath, content, mime }) => { assert.match(mime, /^(text\/|application\/json$)/); staged.push({ relativePath, content, mime }); return relativePath; }, staged }; }
const viewports = [{ name: "desktop", width: 1280, height: 720 }, { name: "mobile", width: 390, height: 844 }];
const builtinPass = ["img-alt", "form-labels", "button-name", "html-lang", "document-title", "heading-order"].map((id) => ({ id, passed: true, failing: 0, selectors: [] }));
const clean = (axe = { violations: [], passes: 20 }) => ({ results: viewports.map((v) => ({ viewport: v.name, axe, builtin: builtinPass })) });
const runWith = (stdout, exitCode = 0) => async () => ({ exitCode, stdout, stderr: "" });
async function evaluate(stdout, extra = {}) { const { A11yEvaluator } = await import(a11y); const ctx = context(); const result = await new A11yEvaluator({ port: 3000, viewports, run: runWith(stdout), ...extra }).execute(ctx); return { result, ctx }; }
async function assertValid(result) { const { validateContractDocument } = await import(contracts); const v = validateContractDocument(result, "evaluator-result"); assert.equal(v.valid, true, JSON.stringify(v)); }

test("GATE-V5-A11Y-001: zero violations passes with score 1 and bounded artifacts", async () => {
  const { result, ctx } = await evaluate(JSON.stringify(clean()));
  assert.equal(result.status, "passed"); assert.equal(result.outcome.privateCode, "A11Y_PASSED"); assert.equal(result.outcome.score, 1);
  assert.deepEqual(result.evidenceRefs, ["a11y/desktop.json", "a11y/mobile.json", "a11y/playwright.log"]);
  assert.equal(ctx.staged.find((x) => x.relativePath === "a11y/playwright.log").mime, "text/plain");
  await assertValid(result);
});

test("GATE-V5-A11Y-002: one critical axe violation fails with score below 1", async () => {
  const { result } = await evaluate(JSON.stringify(clean({ passes: 19, violations: [{ id: "color-contrast", impact: "critical", nodes: 3, selectors: ["#a"] }] })));
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "A11Y_VIOLATIONS");
  assert.ok(result.outcome.score < 1 && result.outcome.score > 0); await assertValid(result);
});

test("GATE-V5-A11Y-003: moderate axe violations count as checks but not failures", async () => {
  const { scoreA11y } = await import(a11y);
  const scored = scoreA11y({ results: [{ viewport: "d", axe: { passes: 9, violations: [{ id: "region", impact: "moderate", nodes: 1, selectors: [] }] }, builtin: builtinPass }] });
  assert.equal(scored.passed, true); assert.equal(scored.score, 1); assert.equal(scored.perViewport[0].checks, 16);
});

test("GATE-V5-A11Y-004: failing builtin form-labels yields violations even without axe", async () => {
  const builtin = builtinPass.map((b) => (b.id === "form-labels" ? { id: "form-labels", passed: false, failing: 2, selectors: ["[placeholder-only] form > input:nth-child(1)", "input#q"] } : b));
  const { result, ctx } = await evaluate(JSON.stringify({ results: [{ viewport: "desktop", builtin }] }));
  assert.equal(result.outcome.privateCode, "A11Y_VIOLATIONS"); assert.equal(result.outcome.score, 1 - 1 / 6);
  const artifact = JSON.parse(ctx.staged.find((x) => x.relativePath === "a11y/desktop.json").content);
  assert.equal(artifact.axe, undefined); assert.equal(artifact.builtin.find((b) => b.id === "form-labels").failing, 2); await assertValid(result);
});

test("GATE-V5-A11Y-005: garbage or failing script output is a measurement failure, not a crash", async () => {
  for (const [stdout, exitCode] of [["not json {", 0], ["{\"results\":[]}", 0], [JSON.stringify(clean()), 1], ["", 0]]) {
    const { A11yEvaluator } = await import(a11y); const ctx = context();
    const result = await new A11yEvaluator({ port: 3000, viewports, run: runWith(stdout, exitCode) }).execute(ctx);
    assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "A11Y_MEASUREMENT_FAILED"); assert.equal(result.outcome.score, 0);
    assert.deepEqual(result.evidenceRefs, ["a11y/playwright.log"]); await assertValid(result);
  }
  const { A11yEvaluator } = await import(a11y); const thrown = await new A11yEvaluator({ port: 3000, viewports, run: async () => { throw new Error("docker down"); } }).execute(context());
  assert.equal(thrown.outcome.privateCode, "A11Y_MEASUREMENT_FAILED");
});

test("GATE-V5-A11Y-006: selectors are limited to 5 and truncated to 120 chars", async () => {
  const long = "x".repeat(500); const many = Array.from({ length: 9 }, (_, i) => `${long}${i}`);
  const { result, ctx } = await evaluate(JSON.stringify({ results: [{ viewport: "desktop", axe: { passes: 1, violations: [{ id: "image-alt", impact: "serious", nodes: 9, selectors: many }] }, builtin: builtinPass.map((b) => (b.id === "img-alt" ? { ...b, passed: false, failing: 9, selectors: many } : b)) }] }));
  const artifact = JSON.parse(ctx.staged.find((x) => x.relativePath === "a11y/desktop.json").content);
  for (const list of [artifact.axe.violations[0].selectors, artifact.builtin.find((b) => b.id === "img-alt").selectors]) { assert.equal(list.length, 5); for (const s of list) assert.equal(s.length, 120); }
  assert.equal(result.outcome.privateCode, "A11Y_VIOLATIONS");
});

test("GATE-V5-A11Y-007: generated script embeds axe, viewports, port and timeouts", async () => {
  const { A11yEvaluator } = await import(a11y); let script = "";
  await new A11yEvaluator({ port: 4173, viewports, axeSource: "window.axe={run:async()=>({passes:[],violations:[]})}", run: async (s) => { script = s; return { exitCode: 0, stdout: JSON.stringify(clean()), stderr: "" }; } }).execute(context());
  for (const needle of ["require('playwright-core')", "http://app:4173/", "networkidle", "setDefaultNavigationTimeout(15000)", "setDefaultTimeout(5000)", "addScriptTag", "wcag2aa", "\"desktop\"", "window.axe="]) assert.ok(script.includes(needle), needle);
});

test("GATE-V5-A11Y-008: vendored axe-core matches the recorded sha256", () => {
  assert.equal(existsSync(axeFile), true);
  const recorded = readFileSync(axeReadme, "utf8").match(/sha256 `([0-9a-f]{64})`/)[1];
  assert.equal(createHash("sha256").update(readFileSync(axeFile)).digest("hex"), recorded);
  assert.match(readFileSync(axeReadme, "utf8"), /axe-core@4\.10\.3/);
});

test("GATE-V5-A11Y-009: a page that blocks axe cannot pass on builtin rules alone", async () => {
  const blocked = clean(); for (const vp of blocked.results) { delete vp.axe; vp.axeError = "Refused to execute inline script (CSP)"; }
  const { result } = await evaluate(JSON.stringify(blocked), { axeSource: "window.axe={}" });
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "A11Y_MEASUREMENT_FAILED"); assert.equal(result.outcome.score, 0);
  assert.match(result.outcome.summary, /axe-core did not run/);
  await assertValid(result);
  // Without axe configured, builtin-only scoring remains legitimate.
  const { result: builtinOnly } = await evaluate(JSON.stringify(blocked));
  assert.equal(builtinOnly.status, "passed");
});

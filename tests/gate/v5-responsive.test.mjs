import assert from "node:assert/strict";
import test from "node:test";

const responsive = new URL("../../packages/evaluator-responsive/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);

function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath, content, mime }) => { assert.ok(mime.startsWith("text/") || mime === "application/json", `unexpected mime ${mime}`); staged.push({ relativePath, content, mime }); return relativePath; }, staged }; }
const viewports = [{ name: "mobile", width: 375, height: 812 }, { name: "desktop", width: 1280, height: 800 }];
function element(testId, overrides = {}) { return { testId, x: 0, y: 0, width: 100, height: 40, right: 100, visible: true, ...overrides }; }
function measurement(viewport, overrides = {}) { return { viewport: viewport.name, width: viewport.width, height: viewport.height, innerWidth: viewport.width, docScrollWidth: viewport.width, bodyScrollWidth: viewport.width, elements: [element("title"), element("button", { x: 10, width: 200, right: 210 })], ...overrides }; }
function stdoutFor(measurements) { return `${JSON.stringify({ measurements })}\n`; }
async function execute(measurementsOrStdout, exitCode = 0) {
  const { ResponsiveEvaluator } = await import(responsive); const { validateContractDocument } = await import(contracts); const ctx = context(); const scripts = [];
  const stdout = typeof measurementsOrStdout === "string" ? measurementsOrStdout : stdoutFor(measurementsOrStdout);
  const result = await new ResponsiveEvaluator({ port: 3000, viewports, run: async (script) => { scripts.push(script); return { exitCode, stdout, stderr: "" }; } }).execute(ctx);
  const validation = validateContractDocument(result, "evaluator-result"); assert.equal(validation.valid, true, JSON.stringify(validation));
  assert.ok(result.evidenceRefs.length > 0); assert.ok(result.evidenceRefs.includes("responsive/playwright.log"));
  for (const ref of result.evidenceRefs) assert.ok(ctx.staged.some((s) => s.relativePath === ref), `evidence ${ref} not staged`);
  return { result, ctx, scripts };
}

test("GATE-V5-001: metadata and generated script target the app at every viewport", async () => {
  const { ResponsiveEvaluator } = await import(responsive);
  const evaluator = new ResponsiveEvaluator({ port: 3000, viewports, run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });
  assert.deepEqual(evaluator.metadata(), { id: "responsive", version: "1", stage: "responsive", prerequisites: ["start"], deterministic: true, informational: true });
  const { scripts } = await execute(viewports.map((v) => measurement(v)));
  assert.equal(scripts.length, 1); assert.match(scripts[0], /require\('playwright-core'\)/); assert.match(scripts[0], /http:\/\/app:3000\//); assert.match(scripts[0], /networkidle/); assert.match(scripts[0], /"mobile"/); assert.match(scripts[0], /deviceScaleFactor:1/);
});

test("GATE-V5-002: all viewports fit -> passed with score 1 and per-viewport artifacts", async () => {
  const { result, ctx } = await execute(viewports.map((v) => measurement(v)));
  assert.equal(result.status, "passed"); assert.equal(result.outcome.privateCode, "RESPONSIVE_PASSED"); assert.equal(result.outcome.score, 1);
  for (const v of viewports) { const artifact = JSON.parse(ctx.staged.find((s) => s.relativePath === `responsive/${v.name}.json`).content); assert.equal(artifact.viewport, v.name); assert.equal(artifact.checks.length, 3); assert.ok(artifact.checks.every((c) => c.passed)); }
});

test("GATE-V5-003: document wider than viewport -> RESPONSIVE_OVERFLOW", async () => {
  const { result } = await execute([measurement(viewports[0], { docScrollWidth: 420 }), measurement(viewports[1])]);
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "RESPONSIVE_OVERFLOW"); assert.equal(result.outcome.score, 5 / 6);
});

test("GATE-V5-004: visible element beyond right edge -> RESPONSIVE_OVERFLOW", async () => {
  const { result, ctx } = await execute([measurement(viewports[0], { elements: [element("wide", { x: 300, width: 200, right: 500 })] }), measurement(viewports[1])]);
  assert.equal(result.outcome.privateCode, "RESPONSIVE_OVERFLOW"); assert.equal(result.outcome.score, 5 / 6);
  const artifact = JSON.parse(ctx.staged.find((s) => s.relativePath === "responsive/mobile.json").content);
  const check = artifact.checks.find((c) => c.id === "no-element-beyond-right-edge"); assert.equal(check.passed, false); assert.match(check.detail, /wide/);
});

test("GATE-V5-005: zero-size visible element -> RESPONSIVE_LAYOUT_DEFECT", async () => {
  const { result } = await execute([measurement(viewports[0], { elements: [element("empty", { width: 0, height: 0, right: 0 })] }), measurement(viewports[1])]);
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "RESPONSIVE_LAYOUT_DEFECT"); assert.equal(result.outcome.score, 5 / 6);
});

test("GATE-V5-006: hidden zero-size or off-edge elements are ignored", async () => {
  const { evaluateMeasurements } = await import(responsive);
  const { checks } = evaluateMeasurements(measurement(viewports[0], { elements: [element("hidden", { width: 0, height: 0, right: 0, visible: false }), element("hidden-wide", { x: 300, width: 500, right: 800, visible: false }), element("ok")] }));
  assert.ok(checks.every((c) => c.passed), JSON.stringify(checks));
  const { result } = await execute([measurement(viewports[0], { elements: [element("hidden", { width: 0, height: 0, right: 0, visible: false })] }), measurement(viewports[1])]);
  assert.equal(result.outcome.privateCode, "RESPONSIVE_PASSED");
});

test("GATE-V5-007: tolerance of 1px is honoured", async () => {
  const { evaluateMeasurements } = await import(responsive);
  assert.ok(evaluateMeasurements(measurement(viewports[0], { docScrollWidth: 376, bodyScrollWidth: 376, elements: [element("edge", { x: 276, width: 100, right: 376 })] })).checks.every((c) => c.passed));
  assert.equal(evaluateMeasurements(measurement(viewports[0], { docScrollWidth: 377 })).checks[0].passed, false);
});

test("GATE-V5-008: garbage stdout or non-zero exit -> RESPONSIVE_MEASUREMENT_FAILED", async () => {
  for (const [stdout, exitCode] of [["not json", 0], ["{\"measurements\":\"nope\"}", 0], [stdoutFor(viewports.map((v) => measurement(v))), 1]]) {
    const { result } = await execute(stdout, exitCode);
    assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "RESPONSIVE_MEASUREMENT_FAILED"); assert.equal(result.outcome.score, 0); assert.deepEqual(result.evidenceRefs, ["responsive/playwright.log"]);
  }
});

test("GATE-V5-009: run() rejection is converted to a failed result, not a crash", async () => {
  const { ResponsiveEvaluator } = await import(responsive); const { validateContractDocument } = await import(contracts); const ctx = context();
  const result = await new ResponsiveEvaluator({ port: 3000, viewports, run: async () => { throw new Error("container gone"); } }).execute(ctx);
  assert.equal(validateContractDocument(result, "evaluator-result").valid, true); assert.equal(result.outcome.privateCode, "RESPONSIVE_MEASUREMENT_FAILED");
  assert.match(ctx.staged.find((s) => s.relativePath === "responsive/playwright.log").content, /container gone/);
});

test("GATE-V5-RESP-010: an empty visible element (status/live region) is not a zero-size defect", async () => {
  const { evaluateMeasurements } = await import(responsive);
  const base = { viewport: "desktop", width: 1280, height: 720, innerWidth: 1280, docScrollWidth: 1280, bodyScrollWidth: 1280 };
  const empty = evaluateMeasurements({ ...base, elements: [{ testId: "form-status", x: 0, y: 0, width: 360, height: 0, right: 360, visible: true, empty: true }] });
  assert.equal(empty.checks.find((c) => c.id === "no-zero-size-visible-testids").passed, true);
  const collapsed = evaluateMeasurements({ ...base, elements: [{ testId: "card", x: 0, y: 0, width: 360, height: 0, right: 360, visible: true, empty: false }] });
  assert.equal(collapsed.checks.find((c) => c.id === "no-zero-size-visible-testids").passed, false);
});

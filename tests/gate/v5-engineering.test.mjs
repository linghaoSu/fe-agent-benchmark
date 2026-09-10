import assert from "node:assert/strict";
import test from "node:test";

const engineering = new URL("../../packages/evaluator-engineering/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);

function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath, content }) => { staged.push({ relativePath, content }); return relativePath; }, staged }; }
function fileDiff(path, addedLines, removedLines = []) {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,${removedLines.length} +1,${addedLines.length} @@\n${removedLines.map((l) => `-${l}`).join("\n")}${removedLines.length ? "\n" : ""}${addedLines.map((l) => `+${l}`).join("\n")}\n`;
}
const lines = (count, prefix = "const x") => Array.from({ length: count }, (_, i) => `${prefix}${i} = ${i};`);
const policy = { writablePaths: ["src/**", "tests/**"], allowDependencyChanges: false };
const failedIds = (analysis) => analysis.checks.filter((c) => !c.passed).map((c) => c.id);

async function run(patch, overrides = {}) {
  const [{ EngineeringEvaluator }, { validateContractDocument }] = await Promise.all([import(engineering), import(contracts)]);
  const ctx = context(); const result = await new EngineeringEvaluator({ patch, policy, ...overrides }).execute(ctx);
  const validation = validateContractDocument(result, "evaluator-result"); assert.ok(validation.valid, JSON.stringify(validation));
  return { result, ctx };
}

test("GATE-V5-ENG-001: metadata is informational and depends on build", async () => {
  const { EngineeringEvaluator } = await import(engineering);
  assert.deepEqual(new EngineeringEvaluator({ patch: "", policy }).metadata(), { id: "engineering", version: "1", stage: "engineering", prerequisites: ["build"], deterministic: true, informational: true });
});
test("GATE-V5-ENG-002: empty patch passes with score 1 and stages a report", async () => {
  const { result, ctx } = await run("");
  assert.equal(result.status, "passed"); assert.equal(result.outcome.score, 1); assert.equal(result.outcome.privateCode, "ENGINEERING_PASSED");
  assert.deepEqual(result.evidenceRefs, ["engineering/report.json"]); assert.equal(ctx.staged[0].relativePath, "engineering/report.json");
  const report = JSON.parse(ctx.staged[0].content); assert.deepEqual(report.files, []); assert.equal(report.checks.length, 6);
});
test("GATE-V5-ENG-003: clean small source+test change passes", async () => {
  const { analyzePatch } = await import(engineering);
  const patch = fileDiff("src/app.ts", ["export const answer = 42;"]) + fileDiff("tests/app.test.ts", ["assert.equal(answer, 42);"]);
  const analysis = analyzePatch(patch, policy);
  assert.deepEqual(analysis.files.map((f) => f.kind), ["source", "test"]); assert.deepEqual(failedIds(analysis), []); assert.equal(analysis.score, 1);
  const { result } = await run(patch); assert.equal(result.status, "passed"); assert.deepEqual(result.evidenceRefs, ["patch.diff", "engineering/report.json"]);
});
test("GATE-V5-ENG-004: console.log fails only no-debug-leftovers", async () => {
  const { analyzePatch } = await import(engineering);
  const analysis = analyzePatch(fileDiff("src/app.ts", ["console.log('hi');"]), policy);
  assert.deepEqual(failedIds(analysis), ["no-debug-leftovers"]); assert.equal(analysis.score, 5 / 6);
  const { result } = await run(fileDiff("src/app.ts", ["console.log('hi');"]));
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "ENGINEERING_ISSUES"); assert.match(result.outcome.summary, /no-debug-leftovers/);
});
test("GATE-V5-ENG-005: lockfile change fails no-dependency-changes unless allowed", async () => {
  const { analyzePatch } = await import(engineering);
  const patch = fileDiff("pnpm-lock.yaml", ["lockfileVersion: 9"]);
  assert.deepEqual(failedIds(analyzePatch(patch, policy)), ["no-dependency-changes"]); assert.equal(analyzePatch(patch, policy).files[0].kind, "dependency");
  assert.deepEqual(failedIds(analyzePatch(patch, { ...policy, allowDependencyChanges: true })), []);
});
test("GATE-V5-ENG-006: dist output is generated and fails check 3", async () => {
  const { analyzePatch } = await import(engineering);
  const analysis = analyzePatch(fileDiff("dist/index.js", ["x"]) + fileDiff("src/a.js.map", ["{}"]), policy);
  assert.deepEqual(analysis.files.map((f) => f.kind), ["generated", "generated"]); assert.deepEqual(failedIds(analysis), ["no-generated-or-build-output"]);
});
test("GATE-V5-ENG-007: 700 added lines fails change-footprint", async () => {
  const { analyzePatch } = await import(engineering);
  const analysis = analyzePatch(fileDiff("src/big.ts", lines(700)) + fileDiff("tests/big.test.ts", ["ok"]), policy);
  assert.deepEqual(failedIds(analysis), ["change-footprint"]); assert.equal(analysis.files[0].added, 700);
  assert.deepEqual(failedIds(analyzePatch(fileDiff("src/big.ts", lines(700)) + fileDiff("tests/big.test.ts", ["ok"]), policy, { maxChangedLines: 800 })), []);
});
test("GATE-V5-ENG-008: 60-line source change requires a test change; small fixes exempt", async () => {
  const { analyzePatch } = await import(engineering);
  const source = fileDiff("src/feature.ts", lines(60));
  assert.deepEqual(failedIds(analyzePatch(source, policy)), ["tests-touched-with-source"]);
  assert.deepEqual(failedIds(analyzePatch(source + fileDiff("tests/feature.spec.ts", ["it('works')"]), policy)), []);
  assert.deepEqual(failedIds(analyzePatch(fileDiff("src/feature.ts", lines(10)), policy)), []);
  assert.deepEqual(failedIds(analyzePatch(source, { writablePaths: ["src/**"], allowDependencyChanges: false })), []);
  const { result } = await run(source); assert.equal(result.status, "failed"); assert.match(result.outcome.summary, /tests-touched-with-source/);
});
test("GATE-V5-ENG-009: fixture-like literals in source fail no-hardcoded-test-data; tests are exempt", async () => {
  const { analyzePatch } = await import(engineering);
  assert.deepEqual(failedIds(analyzePatch(fileDiff("src/list.tsx", ["<li data-testid=\"mock-item\">Lorem ipsum</li>"]), policy)), ["no-hardcoded-test-data"]);
  assert.deepEqual(failedIds(analyzePatch(fileDiff("tests/list.test.tsx", ["const fixture = mock();"]), policy)), []);
});
test("GATE-V5-ENG-010: report is bounded to 50 files and 200-char details; deleted files are counted", async () => {
  const { analyzePatch } = await import(engineering);
  let patch = ""; for (let i = 0; i < 60; i++) patch += fileDiff(`src/f${i}.ts`, [`// TODO ${"x".repeat(300)}`]);
  patch += `diff --git a/src/gone.ts b/src/gone.ts\n--- a/src/gone.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-old\n`;
  const analysis = analyzePatch(patch, policy); assert.equal(analysis.files.length, 61); assert.equal(analysis.files.at(-1).removed, 1);
  assert.ok(analysis.checks.every((c) => c.detail.length <= 200));
  const { ctx } = await run(patch); const report = JSON.parse(ctx.staged[0].content); assert.equal(report.files.length, 50); assert.equal(report.totalFiles, 61);
});

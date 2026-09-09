import assert from "node:assert/strict";
import test from "node:test";

const core = new URL("../../packages/evaluator-core/dist/index.js", import.meta.url);
const integrity = new URL("../../packages/evaluator-integrity/dist/index.js", import.meta.url);
const build = new URL("../../packages/evaluator-build/dist/index.js", import.meta.url);

function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath }) => { staged.push(relativePath); return relativePath; }, staged }; }
test("GATE-V4.1-001: integrity rejects forbidden, non-writable, and dependency edits", async () => {
  const { integrityCode } = await import(integrity);
  assert.equal(integrityCode("+++ b/.env\n", { writablePaths: ["src/**"], forbiddenPaths: ["evaluator/**"], allowDependencyChanges: false }), "INTEGRITY_OUTSIDE_WRITABLE_PATH");
  assert.equal(integrityCode("+++ b/src/private/a.js\n", { writablePaths: ["src/**"], forbiddenPaths: ["src/private/**"], allowDependencyChanges: true }), "INTEGRITY_FORBIDDEN_PATH");
  assert.equal(integrityCode("+++ b/package.json\n", { writablePaths: ["**"], forbiddenPaths: [], allowDependencyChanges: false }), "INTEGRITY_DEPENDENCY_CHANGE");
  assert.equal(integrityCode("+++ b/src/ok.ts\n", { writablePaths: ["src/**"], forbiddenPaths: ["evaluator/**"], allowDependencyChanges: false }), undefined);
});
test("GATE-V4.1-002: pipeline skips dependents and converts invalid output to evaluator error", async () => {
  const { EvaluatorPipeline } = await import(core); const ctx = context();
  const bad = { metadata: () => ({ id: "integrity", version: "1", stage: "integrity", deterministic: true }), prepare: async () => {}, cleanup: async () => {}, execute: async () => ({}) };
  const dependent = { metadata: () => ({ id: "build", version: "1", stage: "build", prerequisites: ["integrity"], deterministic: true }), prepare: async () => { throw Error("must not prepare"); }, cleanup: async () => {}, execute: async () => ({}) };
  const result = await new EvaluatorPipeline([bad, dependent]).run(ctx);
  assert.equal(result.results[0].outcome.privateCode, "EVALUATOR_RESULT_INVALID"); assert.equal(result.results[1].status, "skipped"); assert.deepEqual(ctx.staged, ["evaluator-results/integrity.json", "evaluator-results/build.json"]);
});
test("GATE-V4.1-003: build stops at the first failed configured command", async () => {
  const { BuildEvaluator } = await import(build); const ctx = context(); const calls = [];
  const evaluator = new BuildEvaluator({ commands: { install: "install", typecheck: "typecheck", lint: "lint" }, run: async (command) => { calls.push(command); return { exitCode: command === "typecheck" ? 1 : 0, stdout: "", stderr: "" }; } });
  const result = await evaluator.execute(ctx); assert.equal(result.outcome.privateCode, "BUILD_TYPECHECK_FAILED"); assert.deepEqual(calls, ["install", "typecheck"]); assert.deepEqual(ctx.staged, ["build/install.log", "build/typecheck.log"]);
});

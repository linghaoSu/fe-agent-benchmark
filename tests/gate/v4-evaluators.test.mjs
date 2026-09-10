import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const core = new URL("../../packages/evaluator-core/dist/index.js", import.meta.url);
const integrity = new URL("../../packages/evaluator-integrity/dist/index.js", import.meta.url);
const build = new URL("../../packages/evaluator-build/dist/index.js", import.meta.url);
const artifacts = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
const coordinator = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);
const nodeMin = new URL("../fixtures/projects/node-min", import.meta.url);
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0
  ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}`
  : false;

function cli(...args) { return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }); }
function successfulJson(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }
function evaluatorResult(context, id, status, code, refs = [`evaluator-results/${id}.json`], digest = context.snapshotDigest) {
  return { schemaVersion: 1, evaluatorResultId: `${context.attemptId}:${id}`, evaluatorId: id, evaluatorVersion: "1", attemptId: context.attemptId, stage: id, deterministic: true, status, evaluatedSnapshotDigest: digest, outcome: { passed: status === "passed", privateCode: code, score: status === "passed" ? 1 : 0 }, producerRef: `${context.attemptId}:${id}`, evidenceRefs: refs };
}
async function executeEvaluation(results) {
  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v41-unit-")); const databasePath = join(root, "eval.sqlite");
  const [{ openStateStore }, { ArtifactStoreFs }, { RunExecutor, NoopAgent }] = await Promise.all([import(storeModule), import(artifacts), import(coordinator)]);
  const created = successfulJson(cli("run", "create", nodeMin.pathname, "--seed", "7", "--db", databasePath)); const store = openStateStore(databasePath); const artifactStore = new ArtifactStoreFs({ runsRoot: root, store });
  const evaluator = { async run(context) { const output = results(context); for (const result of output.filter((value) => value.evidenceRefs.includes(`evaluator-results/${value.evaluatorId}.json`))) artifactStore.stage({ runId: context.runId, attemptId: context.attemptId, ordinal: context.ordinal, logicalType: "evaluator_result", mime: "application/json", relativePath: `evaluator-results/${result.evaluatorId}.json`, audience: "maintainer_only", producerRef: result.producerRef, content: JSON.stringify(result) }); return output; } };
  const sandboxRuntime = { async start() {}, async capturePatch() { return ""; }, async cleanup() {}, async snapshot() { return "sha256:fixture"; } };
  try { const run = await new RunExecutor({ store, artifacts: artifactStore, agent: new NoopAgent(), evaluator, sandboxRuntime }).execute(created.runId); return { root, store, runId: created.runId, run, attempt: store.attempts.list(created.runId)[0], result: store.results.find(created.runId) }; } catch (error) { return { root, store, runId: created.runId, error, attempt: store.attempts.list(created.runId)[0], result: store.results.find(created.runId) }; }
}
function closeExecution(execution) { execution.store.close(); removeTree(execution.root); }

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

test("GATE-V4.1-004: coordinator aggregation derives integrity/build truth table", async () => {
  const { validateContractDocument } = await import(contracts);
  const cases = [
    { name: "integrity failed", results: (ctx) => [evaluatorResult(ctx, "integrity", "failed", "INTEGRITY_FORBIDDEN_PATH"), evaluatorResult(ctx, "build", "skipped", "PREREQUISITE_NOT_PASSED")], valid: false, solved: false, build: 0, gates: { integrity: "failed", build: "skipped", criticalFunctionalTests: "not_evaluated" } },
    { name: "build failed", results: (ctx) => [evaluatorResult(ctx, "integrity", "passed", "INTEGRITY_PASSED"), evaluatorResult(ctx, "build", "failed", "BUILD_TEST_FAILED")], valid: true, solved: false, build: 0, gates: { integrity: "passed", build: "failed", criticalFunctionalTests: "not_evaluated" } },
    { name: "both passed", results: (ctx) => [evaluatorResult(ctx, "integrity", "passed", "INTEGRITY_PASSED"), evaluatorResult(ctx, "build", "passed", "BUILD_PASSED")], valid: true, solved: true, build: 1, gates: { integrity: "passed", build: "passed", criticalFunctionalTests: "not_evaluated" } },
  ];
  for (const expected of cases) { const execution = await executeEvaluation(expected.results); try { assert.equal(execution.run.status, "COMPLETED", expected.name); assert.equal(validateContractDocument(JSON.parse(execution.result.resultJson), "result").valid, true); const result = JSON.parse(execution.result.resultJson); assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value, gates: result.extensions.gates }, { valid: expected.valid, solved: expected.solved, build: expected.build, gates: expected.gates }); assert.equal(result.evaluatedSnapshotDigest, execution.attempt.submissionSnapshotDigest); } finally { closeExecution(execution); } }
});

test("GATE-V4.1-005: evaluator errors and digest mismatches fail without a Result", async () => {
  for (const [results, code] of [[(ctx) => [evaluatorResult(ctx, "integrity", "error", "INTEGRITY_ERROR")], "EVALUATOR_ERROR"], [(ctx) => [evaluatorResult(ctx, "integrity", "passed", "INTEGRITY_PASSED", undefined, "sha256:other")], "EVALUATOR_RESULT_INVALID"]]) { const execution = await executeEvaluation(results); try { assert.equal(execution.run.status, "FAILED"); assert.equal(execution.result, undefined); assert.equal(execution.attempt.lifecycleStatus, "FAILED"); assert.equal(execution.attempt.failureCode, code); assert.equal(execution.attempt.executionClassification, "evaluator_error"); } finally { closeExecution(execution); } }
});

test("GATE-V4.1-006: dangling evaluator evidence fails finalization", async () => {
  const execution = await executeEvaluation((ctx) => [evaluatorResult(ctx, "integrity", "passed", "INTEGRITY_PASSED", ["missing-evidence.json"])]);
  try { assert.equal(execution.run.status, "FAILED"); assert.equal(execution.result, undefined); assert.equal(execution.attempt.failureCode, "EVALUATOR_EVIDENCE_REF_DANGLING"); } finally { closeExecution(execution); }
});

function assertNoDockerLeftovers(attemptId) {
  assert.equal(spawnSync("docker", ["container", "ls", "-a", "--filter", `name=fab-${attemptId}`, "--format", "{{.ID}}"], { encoding: "utf8" }).stdout.trim(), "");
  for (const id of [attemptId, `${attemptId}-eval`]) assert.equal(spawnSync("docker", ["network", "ls", "--filter", `label=frontend-agent-benchmark.attempt=${id}`, "--format", "{{.ID}}"], { encoding: "utf8" }).stdout.trim(), "");
}
function dockerScenario(name, verify) {
  test(`GATE-V4.1-Docker: ${name} evaluates node-min offline`, { skip: unavailable, timeout: 120_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "frontend-agent-v41-docker-")); const databasePath = join(root, "eval.sqlite");
    try { const created = successfulJson(cli("run", "create", nodeMin.pathname, "--sandbox", "docker", "--seed", "7", "--db", databasePath)); successfulJson(cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", name, "--sandbox", "docker", "--db", databasePath)); const shown = successfulJson(cli("run", "show", created.runId, "--db", databasePath)); const [attempt] = shown.attempts; const result = shown.result && JSON.parse(shown.result.resultJson); const { validateContractDocument } = await import(contracts); for (const artifact of shown.artifacts.filter(({ relativePath }) => relativePath.startsWith("evaluator-results/"))) assert.equal(validateContractDocument(JSON.parse(readFileSync(join(root, created.runId, "attempts", "1", artifact.relativePath), "utf8")), "evaluator-result").valid, true, artifact.relativePath); await verify({ root, created, shown, attempt, result, databasePath }); assertNoDockerLeftovers(attempt.attemptId); } finally { removeTree(root); }
  });
}
dockerScenario("build-pass", ({ root, created, shown, attempt, result, databasePath }) => {
  const directory = join(root, created.runId, "attempts", "1"); assert.equal(shown.run.status, "COMPLETED"); assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value, gates: result.extensions.gates }, { valid: true, solved: true, build: 1, gates: { integrity: "passed", build: "passed", criticalFunctionalTests: "not_evaluated" } }); assert.equal(result.evaluatedSnapshotDigest, attempt.submissionSnapshotDigest); for (const path of ["evaluator-results/integrity.json", "evaluator-results/build.json", "build/install.log", "build/typecheck.log", "build/lint.log", "build/test.log", "build/build.log", "integrity-report.json", "patch.diff", "snapshot", "process-census.json", "network-policy.json"]) assert.equal(existsSync(join(directory, path)), true, path); assert.ok(shown.artifacts.some(({ relativePath }) => relativePath === "evaluator-results/integrity.json")); assert.ok(shown.attempts[0].submissionSnapshotDigest); const exported = successfulJson(cli("run", "export", "--audience", "requester", created.runId, "--db", databasePath)); const publicResult = JSON.parse(readFileSync(join(root, created.runId, "exports", "requester", "result.json"), "utf8")); assert.deepEqual({ valid: publicResult.valid, solved: publicResult.solved }, { valid: true, solved: true }); assert.doesNotMatch(JSON.stringify(publicResult), /evaluator-results|INTEGRITY_|BUILD_/); });
dockerScenario("build-break", ({ root, created, shown, result }) => { const directory = join(root, created.runId, "attempts", "1"); assert.equal(shown.run.status, "COMPLETED"); assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value }, { valid: true, solved: false, build: 0 }); assert.equal(JSON.parse(readFileSync(join(directory, "evaluator-results/build.json"), "utf8")).outcome.privateCode, "BUILD_TEST_FAILED"); for (const path of ["build/install.log", "build/typecheck.log", "build/lint.log", "build/test.log"]) assert.equal(existsSync(join(directory, path)), true, path); assert.equal(existsSync(join(directory, "build/build.log")), false); });
dockerScenario("forbidden-write", ({ root, created, shown, result }) => { const directory = join(root, created.runId, "attempts", "1"); assert.equal(shown.run.status, "COMPLETED"); assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value }, { valid: false, solved: false, build: 0 }); assert.equal(JSON.parse(readFileSync(join(directory, "evaluator-results/integrity.json"), "utf8")).outcome.privateCode, "INTEGRITY_FORBIDDEN_PATH"); assert.equal(JSON.parse(readFileSync(join(directory, "evaluator-results/build.json"), "utf8")).status, "skipped"); assert.equal(existsSync(join(directory, "build")), false); });

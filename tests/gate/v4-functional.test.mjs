import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const start = new URL("../../packages/evaluator-start/dist/index.js", import.meta.url);
const playwright = new URL("../../packages/evaluator-playwright/dist/index.js", import.meta.url);
const core = new URL("../../packages/evaluator-core/dist/index.js", import.meta.url);
const sandbox = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const coordinator = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const artifacts = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const nodeMin = new URL("../fixtures/projects/node-min", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);

function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath, content }) => { staged.push({ relativePath, content }); return relativePath; }, staged }; }
function cli(...args) { return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8" }); }
function result(ctx, id, status, score = 0) { return { schemaVersion: 1, evaluatorResultId: id, evaluatorId: id, evaluatorVersion: "1", attemptId: ctx.attemptId, stage: id, deterministic: true, status, evaluatedSnapshotDigest: ctx.snapshotDigest, outcome: { passed: status === "passed", privateCode: id, score }, producerRef: id, evidenceRefs: [`evaluator-results/${id}.json`] }; }

test("GATE-V4.2a-001: start timeout is stable and functional is skipped", async () => {
  const [{ StartEvaluator }, { PlaywrightEvaluator }, { EvaluatorPipeline }] = await Promise.all([import(start), import(playwright), import(core)]);
  const root = mkdtempSync(join(tmpdir(), "fab-hidden-")); writeFileSync(join(root, "functional.spec.mjs"), "export default []");
  const ctx = context();
  const startEvaluator = new StartEvaluator({ command: "node app", port: 3000, start: async () => { throw Error("late"); } });
  const functional = new PlaywrightEvaluator({ hiddenBundlePath: root, port: 3000, run: async () => ({ exitCode: 0, stdout: "[]", stderr: "" }) });
  try {
    const results = (await new EvaluatorPipeline([{ metadata: () => ({ id: "build", version: "1", stage: "build", deterministic: true }), prepare: async () => {}, cleanup: async () => {}, execute: async () => ({ schemaVersion: 1, evaluatorResultId: "build", evaluatorId: "build", evaluatorVersion: "1", attemptId: "attempt", stage: "build", deterministic: true, status: "passed", evaluatedSnapshotDigest: "sha256:snapshot", outcome: { passed: true, privateCode: "BUILD_PASSED" }, producerRef: "build", evidenceRefs: ["build.log"] }) }, startEvaluator, functional]).run(ctx)).results;
    assert.equal(results[1].outcome.privateCode, "START_TIMEOUT");
    assert.equal(results[2].status, "skipped");
  } finally { removeTree(root); }
});

test("GATE-V4.2a-002: functional output is sanitized and scored", async () => {
  const { PlaywrightEvaluator } = await import(playwright); const root = mkdtempSync(join(tmpdir(), "fab-hidden-"));
  writeFileSync(join(root, "functional.spec.mjs"), "export default []"); const ctx = context();
  try {
    const result = await new PlaywrightEvaluator({ hiddenBundlePath: root, port: 3000, run: async () => ({ exitCode: 0, stdout: JSON.stringify([{ id: "title-renders", critical: true, passed: true }, { id: "health-endpoint", critical: false, passed: false }]), stderr: "private assertion text" }) }).execute(ctx);
    assert.equal(result.status, "passed"); assert.equal(result.outcome.score, 0.5);
    const artifact = JSON.parse(ctx.staged.find((x) => x.relativePath === "functional/tests.json").content);
    assert.deepEqual(artifact.tests, [{ id: "title-renders", passed: true, critical: true, message: "passed" }, { id: "health-endpoint", passed: false, critical: false, message: "failed" }]);
  } finally { removeTree(root); }
});

test("GATE-V4.2a-003: hidden bundle is absent from every Agent mount", async () => {
  const { DockerSandboxRuntime, DEFAULT_PINNED_NODE_IMAGE } = await import(sandbox); const root = mkdtempSync(join(tmpdir(), "fab-public-"));
  writeFileSync(join(root, "package.json"), "{}"); writeFileSync(join(root, "visible.txt"), "visible");
  mkdirSync(join(root, "evaluator", "hidden"), { recursive: true }); writeFileSync(join(root, "evaluator", "hidden", "spec.mjs"), "secret");
  const specs = []; const client = { ping: async () => {}, inspectImage: async () => ({ id: "image", repoDigests: [] }), createNetwork: async () => "network", removeNetwork: async () => {}, listNetworks: async () => [], containerNetworkIp: async () => "10.0.0.2", createContainer: async (spec) => { specs.push(spec); return `c${specs.length}`; }, startContainer: async () => {}, execContainer: async () => ({ exitCode: 0, stdout: "", stderr: "" }), removeContainer: async () => {} };
  const runtime = new DockerSandboxRuntime({ client, imageReference: DEFAULT_PINNED_NODE_IMAGE, bundlePath: root, writablePaths: ["src/**"], forbiddenPaths: ["evaluator/**"], excludedBundlePaths: ["evaluator"], appNetwork: true });
  try { await runtime.start({ runId: "run", attemptId: "attempt", ordinal: 1, seed: 1 }); const agent = specs.at(-1); assert.equal(agent.networkAliases.includes("app"), true); for (const mount of agent.mounts) assert.equal(existsSync(join(mount.source, "evaluator")), false); }
  finally { await runtime.cleanup({ runId: "run", attemptId: "attempt", ordinal: 1, seed: 1 }); removeTree(root); }
});

test("GATE-V4.2a-004: aggregation maps functional passed, failed, and skipped", async () => {
  const [{ openStateStore }, { ArtifactStoreFs }, { RunExecutor, NoopAgent }] = await Promise.all([import(storeModule), import(artifacts), import(coordinator)]);
  for (const [status, score, solved] of [["passed", 1, true], ["failed", 0.5, false], ["skipped", 0, false]]) {
    const root = mkdtempSync(join(tmpdir(), "fab-functional-result-")); const db = join(root, "state.sqlite"); const created = JSON.parse(cli("run", "create", nodeMin.pathname, "--seed", "1", "--db", db).stdout); const store = openStateStore(db); const artifactStore = new ArtifactStoreFs({ runsRoot: root, store });
    const evaluator = { async run(ctx) { const values = [result(ctx, "integrity", "passed", 1), result(ctx, "build", "passed", 1), result(ctx, "functional", status, score)]; for (const value of values) artifactStore.stage({ runId: ctx.runId, attemptId: ctx.attemptId, ordinal: ctx.ordinal, logicalType: "evaluator_result", mime: "application/json", relativePath: value.evidenceRefs[0], audience: "maintainer_only", producerRef: value.producerRef, content: JSON.stringify(value) }); return values; } };
    try { await new RunExecutor({ store, artifacts: artifactStore, agent: new NoopAgent(), evaluator, sandboxRuntime: { start: async () => {}, capturePatch: async () => "", cleanup: async () => {}, snapshot: async () => "sha256:snapshot" } }).execute(created.runId); const value = JSON.parse(store.results.find(created.runId).resultJson); assert.equal(value.extensions.gates.criticalFunctionalTests, status); assert.equal(value.scores.functional.value, score); assert.equal(value.solved, solved); }
    finally { store.close(); removeTree(root); }
  }
});

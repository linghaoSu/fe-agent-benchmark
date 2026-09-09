import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const artifacts = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
const sandboxModule = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const mockAdapter = new URL("../../packages/adapter-mock/dist/index.js", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);
const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
function cli(...args) { return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8" }); }
function json(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }
class FakeDockerClient {
  actions = []; census = []; failRemovals = 0;
  async ping() { this.actions.push("ping"); }
  async inspectImage() { this.actions.push("inspect"); return { id: "image", repoDigests: [PINNED_IMAGE] }; }
  async createContainer() { this.actions.push("create"); return "container"; }
  async startContainer() { this.actions.push("start"); }
  async execContainer(_id, spec) {
    if (spec.command.at(-1) === "ps -eo pid=,args=") { this.actions.push("census"); return { exitCode: 0, stdout: this.census.shift() ?? "", stderr: "" }; }
    if (String(spec.command.at(-1)).startsWith("kill -TERM")) { this.actions.push("kill"); return { exitCode: 0, stdout: "", stderr: "" }; }
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  async removeContainer() { this.actions.push("cleanup"); if (this.failRemovals-- > 0) throw new Error("cleanup failed"); }
  async createNetwork() { return "network"; }
  async removeNetwork() {}
  async listNetworks() { return []; }
  async containerNetworkIp() { return "172.30.0.2"; }
}
function context(id = "attempt-v33") { return { runId: "run-v33", attemptId: id, ordinal: 1, seed: 7 }; }
async function runtime(root, client, options = {}) {
  const { DockerSandboxRuntime } = await import(sandboxModule);
  return new DockerSandboxRuntime({ client, imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"], ...options });
}
function tree() {
  const root = join(tmpdir(), `fab-v33-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const app = 1;\n");
  writeFileSync(join(root, "node_modules"), "excluded");
  return root;
}
function writable(path) { const stat = lstatSync(path); chmodSync(path, stat.mode | 0o222); if (stat.isDirectory()) readdirSync(path).forEach((name) => writable(join(path, name))); }
test("GATE-V3.3-001: frozen snapshot digest is deterministic and records exclusions", async () => {
  const { collectFrozenSnapshot } = await import(artifacts); const root = tree(); const one = `${root}-one`, two = `${root}-two`;
  try {
    const first = collectFrozenSnapshot(root, one, ["node_modules"]); const second = collectFrozenSnapshot(root, two, ["node_modules"]);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(JSON.parse(readFileSync(join(one, "snapshot-manifest.json"))), JSON.parse(readFileSync(join(two, "snapshot-manifest.json"))));
    writeFileSync(join(root, "src", "app.js"), "export const app = 2;\n");
    assert.notEqual(first.digest, collectFrozenSnapshot(root, `${root}-three`, ["node_modules"]).digest);
    assert.equal(lstatSync(join(one, "src", "app.js")).mode & 0o222, 0);
  } finally { [one, two, `${root}-three`].forEach((p) => { try { writable(p); } catch {} }); [root, one, two, `${root}-three`].forEach((p) => removeTree(p)); }
});
test("GATE-V3.3-003: census kills only residual processes before patch, snapshot, and cleanup", async () => {
  const root = tree(); const client = new FakeDockerClient(); client.census = ["41 sleep 300\n", ""]; const sandbox = await runtime(root, client); const events = [];
  const originalPatch = sandbox.capturePatch.bind(sandbox), originalSnapshot = sandbox.snapshot.bind(sandbox), originalCleanup = sandbox.cleanup.bind(sandbox);
  sandbox.capturePatch = async (value) => { events.push("capturePatch"); return originalPatch(value); };
  sandbox.snapshot = async (value, destination) => { events.push("snapshot"); return originalSnapshot(value, destination); };
  sandbox.cleanup = async (value) => { events.push("cleanup"); return originalCleanup(value); };
  const ctx = context(); const snapshot = `${root}-snapshot`;
  try {
    await sandbox.start(ctx); await sandbox.freeze(ctx); await sandbox.capturePatch(ctx); await sandbox.snapshot(ctx, snapshot); await sandbox.cleanup(ctx);
    assert.deepEqual([...client.actions.filter((event) => ["census", "kill"].includes(event)), ...events], ["census", "kill", "census", "capturePatch", "snapshot", "cleanup"]);
  } finally { removeTree(root); removeTree(snapshot); }
});
test("GATE-V3.3-004: clean census skips kill and snapshots omit declared outputs", async () => {
  const root = tree(); mkdirSync(join(root, "dist")); writeFileSync(join(root, "dist", "asset.js"), "generated"); rmSync(join(root, "node_modules")); mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  const client = new FakeDockerClient(); client.census = [""]; const sandbox = await runtime(root, client, { buildOutputPaths: ["dist/**"] }); const ctx = context(); const snapshot = `${root}-snapshot`;
  try {
    await sandbox.start(ctx); await sandbox.freeze(ctx); await sandbox.snapshot(ctx, snapshot);
    const manifest = JSON.parse(readFileSync(join(snapshot, "snapshot-manifest.json"), "utf8"));
    assert.equal(client.actions.includes("kill"), false);
    assert.deepEqual(manifest.excluded, ["dist", "node_modules"]);
    assert.equal(lstatSync(join(snapshot, "src", "app.js")).mode & 0o222, 0);
    assert.equal(readdirSync(snapshot).includes("dist"), false); assert.equal(readdirSync(snapshot).includes("node_modules"), false);
    await sandbox.cleanup(ctx);
  } finally { removeTree(root); removeTree(snapshot); }
});
test("GATE-V3.3-005: post-census residual is invalid and never retries", async () => {
  const root = tree(); const databasePath = join(root, "eval.sqlite"); const client = new FakeDockerClient(); client.census = ["41 sleep 300\n", "41 sleep 300\n"];
  const created = json(cli("run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath));
  const [{ openStateStore }, { ArtifactStoreFs }, { DockerSandboxRuntime }, coordinator] = await Promise.all([import(storeModule), import(artifacts), import(sandboxModule), import(coordinatorModule)]);
  const store = openStateStore(databasePath);
  try {
    const executor = new coordinator.RunExecutor({ store, artifacts: new ArtifactStoreFs({ runsRoot: root, store }), agent: new coordinator.NoopAgent(), evaluator: new coordinator.NoopEvaluator(), sandboxRuntime: new DockerSandboxRuntime({ client, imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"] }) });
    const run = await executor.execute(created.runId); const attempts = store.attempts.list(created.runId);
    assert.equal(run.status, "COMPLETED"); assert.equal(attempts.length, 1);
    assert.deepEqual({ lifecycle: attempts[0].lifecycleStatus, classification: attempts[0].executionClassification, code: attempts[0].failureCode }, { lifecycle: "FAILED", classification: "invalid", code: "SANDBOX_RESIDUAL_PROCESSES" });
  } finally { store.close(); removeTree(root); }
});
test("GATE-V3.3-005b: cleanup infrastructure failure receives the one retry", async () => {
  const root = tree(); const databasePath = join(root, "eval.sqlite"); const client = new FakeDockerClient(); client.census = ["", ""]; client.failRemovals = 1;
  const created = json(cli("run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath));
  const [{ openStateStore }, { ArtifactStoreFs }, { DockerSandboxRuntime }, coordinator] = await Promise.all([import(storeModule), import(artifacts), import(sandboxModule), import(coordinatorModule)]); const store = openStateStore(databasePath);
  try {
    const run = await new coordinator.RunExecutor({ store, artifacts: new ArtifactStoreFs({ runsRoot: root, store }), agent: new coordinator.NoopAgent(), evaluator: new coordinator.NoopEvaluator(), sandboxRuntime: new DockerSandboxRuntime({ client, imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"] }) }).execute(created.runId);
    const attempts = store.attempts.list(created.runId); assert.equal(run.status, "COMPLETED"); assert.equal(attempts.length, 2); assert.equal(attempts[0].failureCode, "SANDBOX_CLEANUP_FAILED"); assert.equal(attempts[1].lifecycleStatus, "SUCCEEDED");
  } finally { store.close(); removeTree(root); }
});
test("GATE-V3.3-006: closed sandbox rejects late ToolExecutor request without running it", async () => {
  const root = tree(); const databasePath = join(root, "eval.sqlite"); const client = new FakeDockerClient(); client.census = [""];
  const created = json(cli("run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath));
  const [{ openStateStore }, coordinator] = await Promise.all([import(storeModule), import(coordinatorModule)]); const store = openStateStore(databasePath); const ctx = { ...context(), runId: created.runId }; store.attempts.create({ attemptId: ctx.attemptId, runId: ctx.runId, ordinal: 1, seed: 7, createdAt: new Date().toISOString() }); const scenario = join(root, "late.json"); writeFileSync(scenario, JSON.stringify({ toolRequests: [{ toolCallId: "late", tool: "run_command", arguments: { command: "echo late", cwd: "src" } }] })); let calls = 0;
  try {
    const sandbox = await runtime(root, client); await sandbox.start(ctx); await sandbox.freeze(ctx);
    const agent = new coordinator.SubprocessAgentPhase({ store, command: { command: process.execPath, args: [mockAdapter.pathname, scenario] }, maxFrameBytes: 65_536, heartbeatTimeoutMs: 1_000, runner: { run() { calls += 1; return "ran"; } }, toolRouter: { isClosed: () => sandbox.isFrozen(ctx) } });
    await agent.run(ctx); const [call] = store.toolCalls.forAttempt(ctx.attemptId);
    assert.equal(calls, 0); assert.equal(call.outcomeCode, "TOOL_ROUTER_CLOSED"); await sandbox.cleanup(ctx);
  } finally { store.close(); removeTree(root); }
});
for (const [name, make] of [["symlink", (root) => symlinkSync("/tmp", join(root, "bad"))], ["hardlink", (root) => { writeFileSync(join(root, "source"), "x"); linkSync(join(root, "source"), join(root, "bad")); }], ["fifo", (root) => spawnSync("mkfifo", [join(root, "bad")])]]) test(`GATE-V3.3-002: collector rejects ${name}`, async () => {
  const { collectFrozenSnapshot, ArtifactStoreError } = await import(artifacts); const root = tree();
  try { make(root); assert.throws(() => collectFrozenSnapshot(root, `${root}-out`), (error) => error instanceof ArtifactStoreError && error.code === "SNAPSHOT_UNSAFE_ENTRY"); }
  finally { removeTree(root); rmSync(`${root}-out`, { recursive: true, force: true }); }
});

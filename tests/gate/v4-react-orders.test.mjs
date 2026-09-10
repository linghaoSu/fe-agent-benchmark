import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url);
const integrity = new URL("../fixtures/package-proxy/tarballs/INTEGRITY.txt", import.meta.url);
const sandbox = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;

function cli(...args) { return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }); }
function json(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }

test("GATE-V4.2b-001: react orders bundle validates with only vendored proxy dependencies", () => {
  assert.equal(cli("validate", `${task.pathname}/task.yaml`).status, 0);
  assert.equal(cli("checksum", task.pathname).status, 0);
  const lock = JSON.parse(readFileSync(join(task.pathname, "package-lock.json"), "utf8"));
  const available = new Map(readFileSync(integrity, "utf8").trim().split("\n").map((line) => line.split(" ")));
  for (const [location, value] of Object.entries(lock.packages)) {
    if (!location) continue;
    assert.match(value.resolved, /^http:\/\/package-proxy:8080\//);
    const file = value.resolved.slice("http://package-proxy:8080/".length);
    assert.equal(value.integrity, available.get(file), location);
    assert.equal(existsSync(join(task.pathname, "fixtures", file)), true, file);
  }
});

test("GATE-V4.2b-002: private evaluator and gold reference are absent from the Agent public copy", async () => {
  const { DockerSandboxRuntime, DEFAULT_PINNED_NODE_IMAGE } = await import(sandbox);
  const specs = [];
  const client = { ping: async () => {}, inspectImage: async () => ({ id: "image", repoDigests: [] }), createNetwork: async () => "network", removeNetwork: async () => {}, listNetworks: async () => [], containerNetworkIp: async () => "10.0.0.2", createContainer: async (spec) => { specs.push(spec); return `c${specs.length}`; }, startContainer: async () => {}, execContainer: async () => ({ exitCode: 0, stdout: "", stderr: "" }), removeContainer: async () => {} };
  const runtime = new DockerSandboxRuntime({ client, imageReference: DEFAULT_PINNED_NODE_IMAGE, bundlePath: task.pathname, writablePaths: ["src/**", "tests/**"], forbiddenPaths: ["evaluator/**", "references/**"], excludedBundlePaths: ["evaluator", "references"], appNetwork: true });
  const context = { runId: "run", attemptId: "attempt", ordinal: 1, seed: 1 };
  try {
    await runtime.start(context);
    const agent = specs.at(-1);
    const publicMount = agent.mounts.find((mount) => mount.target === "/workspace");
    assert.equal(existsSync(join(publicMount.source, "evaluator")), false);
    assert.equal(existsSync(join(publicMount.source, "references")), false);
  } finally { await runtime.cleanup(context); }
});

function dockerScenario(name, verify) {
  test(`GATE-V4.2b-Docker: ${name}`, { skip: unavailable, timeout: 180_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "fab-react-orders-"));
    const db = join(root, "eval.sqlite");
    try {
      const created = json(cli("run", "create", task.pathname, "--seed", "7", "--sandbox", "docker", "--db", db));
      json(cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", name, "--sandbox", "docker", "--db", db));
      const shown = json(cli("run", "show", created.runId, "--db", db));
      verify({ created, shown, root, db });
    } finally { removeTree(root); }
  });
}

dockerScenario("react-orders-gold", ({ created, shown, root, db }) => {
  const result = JSON.parse(shown.result.resultJson);
  assert.equal(shown.run.status, "COMPLETED");
  assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value, functional: result.scores.functional.value, gate: result.extensions.gates.criticalFunctionalTests }, { valid: true, solved: true, build: 1, functional: 1, gate: "passed" });
  json(cli("run", "export", "--audience", "requester", created.runId, "--db", db));
  const exported = JSON.stringify(JSON.parse(readFileSync(join(root, created.runId, "exports", "requester", "result.json"), "utf8")));
  assert.doesNotMatch(exported, /references\/|evaluator\/|FUNCTIONAL_/);
});

dockerScenario("react-orders-noop", ({ shown }) => {
  const result = JSON.parse(shown.result.resultJson);
  assert.deepEqual({ valid: result.valid, solved: result.solved, build: result.scores.build.value, gate: result.extensions.gates.criticalFunctionalTests }, { valid: true, solved: false, build: 1, gate: "failed" });
  assert.ok(result.scores.functional.value < 1);
});

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const sandbox = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const sourceTask = new URL("../../datasets/tasks/react-todo-toggle-bug-032", import.meta.url).pathname;
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
const json = (r) => { assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); };

const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const context = { runId: "run-1", attemptId: "attempt-open-1", ordinal: 1, seed: 7 };

const DIGEST_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const TASK_YAML = (network, extra = "", image = DIGEST_IMAGE) => `schemaVersion: 1
id: open-network-synthetic
version: 1
title: Synthetic open-network fixture
environment:
  image: ${image}
  repositoryCommit: synthetic-commit
  packageManager: npm
  locale: en-US
  timezone: UTC
  network: ${network}
budget: { maxWallTimeSeconds: 10, maxAgentSteps: 1, maxCostUsd: 0 }
permissions: { writablePaths: [], forbiddenPaths: [], allowDependencyChanges: false }
commands: { install: npm ci, typecheck: npm run typecheck, lint: npm run lint, test: npm test, build: npm run build, start: npm start }
evaluation:
  requiredGates: { integrity: true, build: true, criticalFunctionalTests: true }
  weights: { functional: 1, visual: 0, responsive: 0, accessibility: 0, engineering: 0 }
${extra}`;

const LOCK = (resolved) => JSON.stringify({
  name: "open-network-synthetic", version: "1.0.0", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "open-network-synthetic", version: "1.0.0", dependencies: { scheduler: "0.26.0" } },
    "node_modules/scheduler": { version: "0.26.0", resolved, integrity: "sha512-NlHwttCI/l5gCPR3D1nNXtWABUmBwvZpEQiD4IXSbIDq8BzLIK/7Ir5gTFSGZDUu37K5cMNp0hFtzO38sC7gWA==" },
  },
});

function syntheticBundle(network, resolved, extra, image) {
  const directory = mkdtempSync(join(tmpdir(), "fab-open-network-"));
  writeFileSync(join(directory, "task.yaml"), TASK_YAML(network, extra, image));
  writeFileSync(join(directory, "package-lock.json"), LOCK(resolved));
  return directory;
}

test("GATE-V7.2-001: open-network tasks preflight without a dependency cache snapshot; controlled-proxy still needs one", async () => {
  const { validateTaskFile, preflightTaskBundle } = await import(contracts);
  const registry = "https://registry.npmjs.org/scheduler/-/scheduler-0.26.0.tgz";
  const bundles = [];
  const make = (...args) => { const b = syntheticBundle(...args); bundles.push(b); return b; };
  try {
    const rejected = validateTaskFile(join(make("anything-else", registry), "task.yaml"));
    assert.equal(rejected.valid, false);
    assert.ok(rejected.errors.some((error) => error.location === "/environment/network"), JSON.stringify(rejected.errors));

    assert.deepEqual(preflightTaskBundle(make("open", registry)), { preflight: "passed" });

    // Without a snapshot the image digest is the only runtime pin, and a proxy would never be reachable.
    const unpinnedImage = preflightTaskBundle(make("open", registry, "", "synthetic-image"));
    assert.deepEqual(unpinnedImage.codes.map((c) => [c.code, c.location]), [["DEPENDENCY_LOCK_INVALID", "/environment/image"]]);
    const withProxy = preflightTaskBundle(make("open", registry, "", `${DIGEST_IMAGE}\n  packageProxy: { image: ${JSON.stringify(DIGEST_IMAGE)}, port: 8080, fixtureDirectory: fixtures, command: [sh] }`));
    assert.deepEqual(withProxy.codes.map((c) => [c.code, c.location]), [["DEPENDENCY_LOCK_INVALID", "/environment/packageProxy"]]);

    const proxyUrl = preflightTaskBundle(make("open", "http://package-proxy:8080/scheduler-0.26.0.tgz"));
    assert.equal(proxyUrl.preflight, "rejected");
    assert.deepEqual(proxyUrl.codes.map((c) => [c.code, c.location]), [["DEPENDENCY_LOCK_INVALID", "/packages/node_modules~1scheduler/resolved"]]);

    const controlled = preflightTaskBundle(make("controlled-proxy", registry));
    assert.equal(controlled.preflight, "rejected");
    assert.deepEqual(controlled.codes.map((c) => [c.code, c.location]), [["DEPENDENCY_CACHE_MISS", "/extensions/dependencyCacheSnapshot"]]);
  } finally { for (const b of bundles) rmSync(b, { recursive: true, force: true }); }
});

class FakeDockerClient {
  actions = [];
  async ping() { this.actions.push("ping"); }
  async inspectImage() { return { id: "sha256:image", repoDigests: [PINNED_IMAGE] }; }
  async createContainer(spec) { this.actions.push("create"); this.createSpec = spec; return "container-1"; }
  async startContainer() {}
  async execContainer() { return { exitCode: 0, stdout: "", stderr: "" }; }
  async removeContainer() { this.actions.push("remove"); }
  async createNetwork(spec) { this.actions.push("network-create"); this.networkSpec = spec; return "network-1"; }
  async removeNetwork() { this.actions.push("network-remove"); }
  async listNetworks() { return []; }
  async containerNetworkIp() { return "172.30.0.2"; }
}

test("GATE-V7.2-002: open mode attaches a non-internal network without registry or DNS overrides and rejects a package proxy", async () => {
  const { DockerSandboxRuntime, SandboxDockerError } = await import(sandbox);
  const directory = mkdtempSync(join(tmpdir(), "fab-open-unit-"));
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "input.js"), "export const input = true;\n");
  const client = new FakeDockerClient();
  try {
    const runtime = new DockerSandboxRuntime({ client, imageReference: PINNED_IMAGE, bundlePath: directory, writablePaths: ["src/**"], network: "open" });
    await runtime.start(context);
    assert.deepEqual(client.actions, ["ping", "network-create", "create"]);
    assert.deepEqual({ internal: client.networkSpec.internal, label: client.networkSpec.labels["frontend-agent-benchmark.attempt"] }, { internal: false, label: context.attemptId });
    const spec = client.createSpec;
    assert.deepEqual({ networkMode: spec.networkMode, dns: spec.dns, extraHosts: spec.extraHosts, readOnlyRootfs: spec.readOnlyRootfs, noNewPrivileges: spec.noNewPrivileges, user: spec.user }, { networkMode: "network-1", dns: undefined, extraHosts: undefined, readOnlyRootfs: true, noNewPrivileges: true, user: "1000:1000" });
    assert.equal(spec.environment.npm_config_registry, undefined);
    assert.equal(spec.environment.NPM_CONFIG_REGISTRY, undefined);
    assert.deepEqual({ cache: spec.environment.npm_config_cache, home: spec.environment.HOME }, { cache: "/tmp/.npm", home: "/tmp" });
    await runtime.cleanup(context);
    assert.deepEqual(client.actions.slice(3), ["remove", "network-remove"]);

    const proxyClient = new FakeDockerClient();
    assert.throws(
      () => new DockerSandboxRuntime({ client: proxyClient, imageReference: PINNED_IMAGE, bundlePath: directory, writablePaths: ["src/**"], network: "open", services: { packageProxy: { image: PINNED_IMAGE, command: ["sh"], port: 8080 } } }),
      (error) => error instanceof SandboxDockerError && error.code === "SANDBOX_START_FAILED",
    );
    assert.deepEqual(proxyClient.actions, []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

/** The dataset is already open-network; the gate runs on a private copy so the committed bundle stays untouched. */
function openCopy(root) {
  const task = join(root, "react-todo-toggle-bug-032");
  cpSync(sourceTask, task, { recursive: true });
  return task;
}

test("GATE-V7.2-Docker: an open-network task installs from the public registry inside the sandbox and solves with the gold reference", { skip: unavailable, timeout: 900_000 }, async () => {
  const { preflightTaskBundle } = await import(contracts);
  const root = mkdtempSync(join(tmpdir(), "fab-open-docker-"));
  const db = join(root, "eval.sqlite");
  try {
    const task = openCopy(root);
    assert.deepEqual(preflightTaskBundle(task), { preflight: "passed" });
    const created = json(cli("run", "create", task, "--seed", "7", "--sandbox", "docker", "--db", db));
    assert.equal(JSON.parse(readFileSync(join(root, created.runId, "input.json"), "utf8")).network, "open");
    json(cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", "reference:gold", "--evaluators", "pipeline", "--sandbox", "docker", "--db", db));
    const shown = json(cli("run", "show", created.runId, "--db", db));
    assert.equal(shown.run.status, "COMPLETED");
    const result = JSON.parse(shown.result.resultJson);
    assert.equal(result.solved, true, JSON.stringify(result.extensions.gates));
    const attempt = join(root, created.runId, "attempts", "1");
    assert.match(readFileSync(join(attempt, "build", "install.log"), "utf8"), /added \d+ packages/);
    const policy = JSON.parse(readFileSync(join(attempt, "network-policy.json"), "utf8"));
    assert.deepEqual({ defaultAction: policy.defaultAction, destinations: policy.allowedDestinations, denied: policy.extensions.deniedCategories }, { defaultAction: "allow", destinations: [], denied: [] });
    const attemptId = shown.attempts[0].attemptId;
    const networks = spawnSync("docker", ["network", "ls", "--filter", `label=frontend-agent-benchmark.attempt=${attemptId}`, "--format", "{{.Name}}"], { encoding: "utf8" });
    assert.equal(networks.stdout.trim(), "");
  } finally { removeTree(root); }
});

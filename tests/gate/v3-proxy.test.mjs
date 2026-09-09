import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sandboxModule = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const contractsModule = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0
  ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}`
  : false;

class FakeDocker {
  constructor({ healthy = true } = {}) { this.healthy = healthy; this.events = []; this.specs = []; }
  async ping() { this.events.push("ping"); }
  async inspectImage() { return { id: "image", repoDigests: [PINNED_IMAGE] }; }
  async createNetwork() { this.events.push("network"); return "network"; }
  async createContainer(spec) { this.specs.push(spec); this.events.push(`create:${spec.name}`); return spec.name; }
  async startContainer(id) { this.events.push(`start:${id}`); }
  async containerNetworkIp(id) { return id.includes("package-proxy") ? "172.20.0.2" : "172.20.0.3"; }
  async execContainer(id) { this.events.push(`probe:${id}`); return { exitCode: this.healthy ? 0 : 1, stdout: "", stderr: "" }; }
  async removeContainer(id) { this.events.push(`remove:${id}`); }
  async removeNetwork() { this.events.push("remove:network"); }
  async listNetworks() { return []; }
}

function cli(...args) {
  return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8" });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("GATE-V3.2-Proxy: fixture proxy is mounted, probed before agent, and registry settings are fixed", async () => {
  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v3-proxy-"));
  const context = { runId: "run-proxy", attemptId: "attempt-proxy", ordinal: 1, seed: 7 };
  const client = new FakeDocker();
  try {
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "tests", "fixtures", "registry"), { recursive: true });
    writeFileSync(join(root, "src", "input.js"), "export {};\n");
    writeFileSync(join(root, "tests", "fixtures", "registry", "fixture.tgz"), "fixture");
    const { DockerSandboxRuntime } = await import(sandboxModule);
    const runtime = new DockerSandboxRuntime({
      client, imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"],
      services: { packageProxy: { image: PINNED_IMAGE, port: 8080, command: ["node", "-e", ""], fixtureDirectory: "tests/fixtures/registry" } },
    });
    await runtime.start(context);
    const proxy = client.specs.find(({ name }) => name.endsWith("-package-proxy"));
    const agent = client.specs.find(({ name }) => !name.endsWith("-package-proxy"));
    assert.ok(proxy?.mounts.some(({ target }) => target === "/fixtures"));
    assert.equal(agent.environment.npm_config_registry, "http://package-proxy:8080/");
    assert.equal(agent.environment.NPM_CONFIG_REGISTRY, "http://package-proxy:8080/");
    assert.equal(agent.environment.npm_config_cache, "/tmp/.npm");
    assert.ok(client.events.findIndex((event) => event.startsWith("probe:")) < client.events.findIndex((event) => event === `create:${agent.name}`));
    await runtime.cleanup(context);
    assert.ok(client.events.indexOf(`remove:${agent.name}`) < client.events.indexOf(`remove:${proxy.name}`));
  } finally { removeTree(root); }
});

test("GATE-V3.2-Proxy: unavailable proxy fails before the agent container is created", async () => {
  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v3-proxy-down-"));
  const context = { runId: "run-proxy", attemptId: "attempt-proxy-down", ordinal: 1, seed: 7 };
  const client = new FakeDocker({ healthy: false });
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "input.js"), "export {};\n");
    const { DEPENDENCY_PROXY_UNAVAILABLE, DockerSandboxRuntime } = await import(sandboxModule);
    const runtime = new DockerSandboxRuntime({
      client, imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"],
      services: { packageProxy: { image: PINNED_IMAGE, port: 8080, command: ["node", "-e", ""] } },
    });
    await assert.rejects(runtime.start(context), { code: DEPENDENCY_PROXY_UNAVAILABLE });
    assert.equal(client.specs.filter(({ name }) => !name.endsWith("-package-proxy")).length, 0);
  } finally { removeTree(root); }
});

test("GATE-V3.2-Proxy: unavailable diagnostic is a trusted schema-valid record", async () => {
  const { proxyDiagnosticRecord } = await import(coordinatorModule);
  const { validateContractDocument } = await import(contractsModule);
  const record = proxyDiagnosticRecord({
    attemptId: "attempt-proxy", dependencyCacheSnapshotId: "snapshot-fixture",
    proxyConfigurationHash: "sha256:proxy-fixture", observedAt: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(record.outcome, "unavailable");
  assert.equal(record.trustedObservation.includes("Coordinator probe"), true);
  assert.equal(validateContractDocument(record, "proxy-diagnostic-record").valid, true);
});

test("GATE-V3.2-Proxy: proxy preflight failure is finalized, retryable, and visible through run show", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v3-proxy-retry-"));
  const databasePath = join(directory, "eval.sqlite");
  try {
    const { runId } = json(cli("run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath));
    const { openStateStore } = await import(storeModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const unavailableProxy = {
        async start() { const error = new Error("proxy down"); error.code = "DEPENDENCY_PROXY_UNAVAILABLE"; throw error; },
        async cleanup() {}, async capturePatch() { return ""; },
      };
      assert.equal((await new RunExecutor({
        store, agent: new NoopAgent(), evaluator: new NoopEvaluator(), sandboxRuntime: unavailableProxy,
      }).execute(runId)).status, "FAILED");
    } finally { store.close(); }
    const shown = json(cli("run", "show", runId, "--db", databasePath));
    assert.deepEqual(shown.attempts.map(({ ordinal, executionClassification, failureCode }) => ({ ordinal, executionClassification, failureCode })), [1, 2].map((ordinal) => ({
      ordinal, executionClassification: "infrastructure_error", failureCode: "DEPENDENCY_PROXY_UNAVAILABLE",
    })));
    assert.deepEqual(shown.artifacts.map(({ logicalType, audience }) => ({ logicalType, audience })), [
      { logicalType: "proxy_diagnostic", audience: "maintainer_only" },
      { logicalType: "proxy_diagnostic", audience: "maintainer_only" },
    ]);
  } finally { removeTree(directory); }
});

test("GATE-V3.2-Docker: npm ci installs the fixture tarball through only the internal package proxy", {
  skip: unavailable,
  timeout: 120_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v3-proxy-install-"));
  const context = { runId: "run-proxy-install", attemptId: `attempt-proxy-install-${Date.now()}`, ordinal: 1, seed: 7 };
  const fixture = new URL("../fixtures/package-proxy/tarballs/fixture-proxy-package-1.0.0.tgz", import.meta.url);
  try {
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, "fixtures"));
    cpSync(fixture, join(root, "fixtures", "fixture.tgz"));
    const integrity = `sha512-${createHash("sha512").update(readFileSync(join(root, "fixtures", "fixture.tgz"))).digest("base64")}`;
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "proxy-install", dependencies: { "@fixture/proxy-package": "1.0.0" } }));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {
      "": { name: "proxy-install", dependencies: { "@fixture/proxy-package": "1.0.0" } },
      "node_modules/@fixture/proxy-package": { version: "1.0.0", resolved: "http://package-proxy:8080/fixture.tgz", integrity },
    } }));
    const { DockerSandboxRuntime, DockerCliClient } = await import(sandboxModule);
    const runtime = new DockerSandboxRuntime({
      imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**", "node_modules/**"],
      services: { packageProxy: {
        image: PINNED_IMAGE, port: 8080, fixtureDirectory: "fixtures",
        command: ["node", "-e", "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>f.createReadStream(p.join('/fixtures',decodeURIComponent(q.url))).on('error',()=>{s.statusCode=404;s.end()}).pipe(s)).listen(8080)"],
      } },
    });
    await runtime.start(context);
    assert.match(await runtime.run("run_command", { command: "npm ci --ignore-scripts" }), /added 1 package/);
    await runtime.cleanup(context);
    assert.deepEqual(await new DockerCliClient().listNetworks(`frontend-agent-benchmark.attempt=${context.attemptId}`), []);
  } finally { removeTree(root); }
});

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const sandbox = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;

function cli(...args) { return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 }); }
function json(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return JSON.parse(result.stdout); }

test("GATE-V5.1-001: committed visual baselines are real PNGs matching the declared viewports", () => {
  const baselines = join(task.pathname, "evaluator", "hidden", "baselines");
  for (const [name, width, height] of [["desktop", 1440, 900], ["tablet", 768, 1024], ["mobile", 375, 812]]) {
    const bytes = readFileSync(join(baselines, `${name}.png`));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", name);
    assert.equal(bytes.readUInt32BE(16), width, `${name} width`);
    assert.equal(bytes.readUInt32BE(20), height, `${name} height`);
  }
});

test("GATE-V5.1-002: hidden baselines never enter the Agent public bundle", async () => {
  const { DockerSandboxRuntime, DEFAULT_PINNED_NODE_IMAGE } = await import(sandbox);
  const specs = [];
  const client = { ping: async () => {}, inspectImage: async () => ({ id: "image", repoDigests: [] }), createNetwork: async () => "network", removeNetwork: async () => {}, listNetworks: async () => [], containerNetworkIp: async () => "10.0.0.2", createContainer: async (spec) => { specs.push(spec); return `c${specs.length}`; }, startContainer: async () => {}, execContainer: async () => ({ exitCode: 0, stdout: "", stderr: "" }), removeContainer: async () => {} };
  const runtime = new DockerSandboxRuntime({ client, imageReference: DEFAULT_PINNED_NODE_IMAGE, bundlePath: task.pathname, writablePaths: ["src/**", "tests/**"], forbiddenPaths: ["evaluator/**", "references/**"], excludedBundlePaths: ["evaluator", "references"] });
  const context = { runId: "run", attemptId: "attempt-v5", ordinal: 1, seed: 1 };
  try {
    await runtime.start(context);
    for (const mount of specs.at(-1).mounts) {
      assert.equal(existsSync(join(mount.source, "evaluator")), false, mount.target);
      assert.equal(existsSync(join(mount.source, "references")), false, mount.target);
    }
  } finally { await runtime.cleanup(context); }
});

function dockerScenario(name, verify) {
  test(`GATE-V5.1-Docker: ${name}`, { skip: unavailable, timeout: 420_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "fab-v5-quality-"));
    const db = join(root, "eval.sqlite");
    try {
      const created = json(cli("run", "create", task.pathname, "--seed", "7", "--sandbox", "docker", "--db", db));
      json(cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", name, "--sandbox", "docker", "--db", db));
      const shown = json(cli("run", "show", created.runId, "--db", db));
      const result = JSON.parse(shown.result.resultJson);
      const attempt = join(root, created.runId, "attempts", "1");
      const { validateContractDocument } = await import(contracts);
      for (const id of ["visual", "responsive", "accessibility"]) {
        const document = JSON.parse(readFileSync(join(attempt, "evaluator-results", `${id}.json`), "utf8"));
        assert.equal(validateContractDocument(document, "evaluator-result").valid, true, id);
      }
      assert.deepEqual(readdirSync(join(attempt, "screenshots")).sort(), ["desktop.png.json", "mobile.png.json", "tablet.png.json"]);
      for (const file of readdirSync(join(attempt, "screenshots"))) {
        const shot = JSON.parse(readFileSync(join(attempt, "screenshots", file), "utf8"));
        assert.equal(Buffer.from(shot.pngBase64, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a", file);
      }
      await verify({ result, shown, attempt });
      assert.equal(spawnSync("docker", ["ps", "-a", "--filter", `name=${shown.attempts[0].attemptId}`, "--format", "{{.Names}}"], { encoding: "utf8" }).stdout.trim(), "");
    } finally { removeTree(root); }
  });
}

dockerScenario("react-orders-gold", ({ result }) => {
  assert.equal(result.solved, true);
  assert.deepEqual(result.extensions.dimensions, { visual: "passed", responsive: "passed", accessibility: "passed", engineering: "passed" });
  assert.ok(result.scores.visual.value >= 0.9, `visual ${result.scores.visual.value}`);
  assert.equal(result.scores.responsive.value, 1);
  assert.equal(result.scores.accessibility.value, 1);
  assert.ok(result.extensions.quality > 0.95);
});

dockerScenario("react-orders-mutation-overflow", ({ result }) => {
  // Quality dimensions record the defect but never offset the functional gate.
  assert.equal(result.solved, true);
  assert.equal(result.extensions.gates.criticalFunctionalTests, "passed");
  assert.equal(result.extensions.dimensions.responsive, "failed");
  assert.ok(result.scores.responsive.value < 1);
  assert.ok(result.extensions.quality < 0.95);
});

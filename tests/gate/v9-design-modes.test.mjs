import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const sandbox = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const router = new URL("../../packages/tool-router/dist/index.js", import.meta.url);
const fixture = new URL("../fixtures/design/dao-synthetic", import.meta.url).pathname;
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
const json = (r) => { assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); };
const failedJson = (r) => { assert.equal(r.status, 1, r.stderr || r.stdout); return JSON.parse(r.stdout); };
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const context = { runId: "run-1", attemptId: "attempt-design-1", ordinal: 1, seed: 7 };

/** Private copy of the fixture so gates can mutate it. */
function copyFixture(root, mutate = () => {}) {
  const bundle = join(root, "bundle");
  cpSync(fixture, bundle, { recursive: true });
  mutate(bundle);
  return bundle;
}

function editTask(bundle, replace) {
  const path = join(bundle, "task.yaml");
  writeFileSync(path, replace(readFileSync(path, "utf8")));
}

test("GATE-V9-001: preflight accepts a design block with existing assets and reads it as task metadata", async () => {
  const { preflightTaskBundle, readPreflightedTaskBundle, validateTaskFile, designPathsHiddenByMode } = await import(contracts);
  assert.equal(validateTaskFile(join(fixture, "task.yaml")).valid, true);
  assert.deepEqual(preflightTaskBundle(fixture), { preflight: "passed" });
  const design = readPreflightedTaskBundle(fixture).design;
  assert.deepEqual(design, { sketchSpec: "design/spec.json", images: ["design/home.png"], modes: ["sketch", "image", "both"] });
  assert.deepEqual(designPathsHiddenByMode(design, "image"), ["design/spec.json"]);
  assert.deepEqual(designPathsHiddenByMode(design, "sketch"), ["design/home.png"]);
  assert.deepEqual(designPathsHiddenByMode(design, "both"), []);

  // The pnpm v9 lockfile (settings/importers/packages/snapshots, npmmirror tarball) is accepted in open mode.
  const lock = readFileSync(join(fixture, "pnpm-lock.yaml"), "utf8");
  assert.match(lock, /lockfileVersion: '9\.0'/);
  assert.match(lock, /^snapshots:/m);
  assert.match(lock, /registry\.npmmirror\.com/);

  // `modes` defaults to all three.
  const root = mkdtempSync(join(tmpdir(), "fab-design-preflight-"));
  try {
    const bundle = copyFixture(root, (b) => editTask(b, (t) => t.replace(/\n  modes: .*\n/, "\n")));
    assert.deepEqual(preflightTaskBundle(bundle), { preflight: "passed" });
    assert.deepEqual(readPreflightedTaskBundle(bundle).design.modes, ["sketch", "image", "both"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("GATE-V9-002: preflight rejects missing assets, non-PNG images, invalid spec JSON, and modes without assets", async () => {
  const { preflightTaskBundle, validateTaskFile } = await import(contracts);
  const cases = [
    ["missing spec", (b) => rmSync(join(b, "design", "spec.json")), ["DESIGN_ASSET_MISSING", "/design/sketchSpec", "design/spec.json"]],
    ["missing image", (b) => rmSync(join(b, "design", "home.png")), ["DESIGN_ASSET_MISSING", "/design/images/0", "design/home.png"]],
    ["bad JSON", (b) => writeFileSync(join(b, "design", "spec.json"), "{not json"), ["DESIGN_ASSET_INVALID", "/design/sketchSpec", "design/spec.json"]],
    ["not a PNG", (b) => writeFileSync(join(b, "design", "home.png"), "GIF89a"), ["DESIGN_ASSET_INVALID", "/design/images/0", "design/home.png"]],
    ["writable design dir", (b) => editTask(b, (t) => t.replace("writablePaths: [src/**]", "writablePaths: [src/**, design/**]")), ["DESIGN_ASSET_INVALID", "/design/sketchSpec", "task.yaml"]],
    ["forbidden design dir", (b) => editTask(b, (t) => t.replace("forbiddenPaths: []", "forbiddenPaths: [design/**]")), ["DESIGN_ASSET_INVALID", "/design/sketchSpec", "task.yaml"]],
    ["image mode without images", (b) => editTask(b, (t) => t.replace("  images: [design/home.png]\n", "").replace("modes: [sketch, image, both]", "modes: [image]")), ["DESIGN_MODE_UNSUPPORTED", "/design/modes", "task.yaml"]],
  ];
  for (const [name, mutate, [code, location, file]] of cases) {
    const root = mkdtempSync(join(tmpdir(), "fab-design-reject-"));
    try {
      const result = preflightTaskBundle(copyFixture(root, mutate));
      assert.equal(result.preflight, "rejected", name);
      assert.deepEqual(result.codes.map((c) => [c.code, c.location, c.file]), [[code, location, file]], name);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  // Structural: non-.png image paths and unknown modes never reach preflight.
  const root = mkdtempSync(join(tmpdir(), "fab-design-schema-"));
  try {
    const bundle = copyFixture(root, (b) => editTask(b, (t) => t.replace("images: [design/home.png]", "images: [design/home.jpg]").replace("modes: [sketch, image, both]", "modes: [sketch, video]")));
    const validation = validateTaskFile(join(bundle, "task.yaml"));
    assert.equal(validation.valid, false);
    assert.deepEqual(validation.errors.map((e) => e.location).sort(), ["/design/images/0", "/design/modes/1"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("GATE-V9-003: run create requires a supported --design-mode for design tasks and records it immutably", async () => {
  const root = mkdtempSync(join(tmpdir(), "fab-design-run-"));
  const db = join(root, "eval.sqlite");
  try {
    const bundle = copyFixture(root);
    const missing = failedJson(cli("run", "create", bundle, "--seed", "1", "--sandbox", "docker", "--db", db));
    assert.equal(missing.code, "DESIGN_MODE_REQUIRED");
    assert.match(missing.message, /--design-mode sketch\|image\|both/);

    const unsupported = failedJson(cli("run", "create", bundle, "--seed", "1", "--sandbox", "docker", "--design-mode", "video", "--db", db));
    assert.equal(unsupported.code, "DESIGN_MODE_UNSUPPORTED");

    const restricted = copyFixture(join(root, "restricted"), (b) => editTask(b, (t) => t.replace("modes: [sketch, image, both]", "modes: [image]")));
    const notInModes = failedJson(cli("run", "create", restricted, "--seed", "1", "--sandbox", "docker", "--design-mode", "sketch", "--db", db));
    assert.equal(notInModes.code, "DESIGN_MODE_UNSUPPORTED");
    assert.match(notInModes.message, /supports design modes image, not sketch/);

    // A task without design assets rejects the option.
    const plain = new URL("../fixtures/preflight/passing", import.meta.url).pathname;
    assert.equal(failedJson(cli("run", "create", plain, "--seed", "1", "--design-mode", "both", "--db", db)).code, "DESIGN_MODE_NOT_APPLICABLE");
    // The fake sandbox has no workspace to hide assets from, so design Tasks require Docker.
    assert.equal(failedJson(cli("run", "create", bundle, "--seed", "1", "--design-mode", "image", "--db", db)).code, "DESIGN_MODE_UNSUPPORTED");

    const created = json(cli("run", "create", bundle, "--seed", "1", "--sandbox", "docker", "--design-mode", "image", "--db", db));
    const input = JSON.parse(readFileSync(join(root, created.runId, "input.json"), "utf8"));
    assert.equal(input.designMode, "image");
    assert.deepEqual(input.design, { sketchSpec: "design/spec.json", images: ["design/home.png"], modes: ["sketch", "image", "both"] });
    const shown = json(cli("run", "show", created.runId, "--db", db));
    assert.equal(JSON.parse(shown.run.resolvedInputJson).designMode, "image");

    // Mode is part of the input hash, so Runs of different modes never share a fingerprint.
    const sketch = json(cli("run", "create", bundle, "--seed", "1", "--sandbox", "docker", "--design-mode", "sketch", "--db", db));
    assert.notEqual(sketch.inputHash, created.inputHash);
  } finally { removeTree(root); }
});

class FakeDockerClient {
  async ping() {}
  async inspectImage() { return { id: "sha256:image", repoDigests: [PINNED_IMAGE] }; }
  async createContainer(spec) { this.createSpec = spec; return "container-1"; }
  async startContainer() {}
  async execContainer() { return { exitCode: 0, stdout: "", stderr: "" }; }
  async removeContainer() {}
  async createNetwork() { return "network-1"; }
  async removeNetwork() {}
  async listNetworks() { return []; }
  async containerNetworkIp() { return "172.30.0.2"; }
}

test("GATE-V9-004: the public workspace mount omits exactly the design files the mode hides", async () => {
  const { DockerSandboxRuntime } = await import(sandbox);
  const { designPathsHiddenByMode } = await import(contracts);
  const design = { sketchSpec: "design/spec.json", images: ["design/home.png"], modes: ["sketch", "image", "both"] };
  for (const [mode, absent, present] of [["image", "design/spec.json", "design/home.png"], ["sketch", "design/home.png", "design/spec.json"]]) {
    const client = new FakeDockerClient();
    const runtime = new DockerSandboxRuntime({ client, imageReference: PINNED_IMAGE, bundlePath: fixture, writablePaths: ["src/**"], network: "open", excludedBundlePaths: ["references", ...designPathsHiddenByMode(design, mode)] });
    await runtime.start(context);
    try {
      const publicMount = client.createSpec.mounts.find((m) => m.target === "/workspace");
      assert.equal(publicMount.readOnly, true);
      assert.equal(existsSync(join(publicMount.source, ...absent.split("/"))), false, `${mode} must hide ${absent}`);
      assert.equal(existsSync(join(publicMount.source, ...present.split("/"))), true, `${mode} must show ${present}`);
      assert.equal(client.createSpec.mounts.some((m) => m.target === "/workspace/design"), false, "design/ is served by the read-only public mount only");
      assert.equal(existsSync(join(fixture, absent)), true, "the source bundle is untouched");
    } finally { await runtime.cleanup(context); }
  }
});

test("GATE-V9-005: read_file with encoding base64 returns the file's base64 and the router counts its bytes", async () => {
  const { FakeWorkspaceRunner, ToolExecutor, resolveToolPolicy } = await import(router);
  const png = readFileSync(join(fixture, "design", "home.png"));
  const completed = [];
  const executor = new ToolExecutor({
    policy: resolveToolPolicy({ writablePaths: ["src/**"] }),
    budgets: { maxToolCalls: 10, maxTotalToolOutputBytes: 1_048_576, maxWallTimeMs: 60_000 },
    outputCapBytes: 65_536,
    runner: new FakeWorkspaceRunner({ "design/home.png": png, "design/spec.json": "{\"a\":1}" }),
    recorder: { accept() {}, complete(record) { completed.push(record); } },
  });
  const result = await executor.execute({ attemptId: "a", seq: 1, tool: "read_file", arguments: { path: "design/home.png", encoding: "base64" } });
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.text, png.toString("base64"));
  assert.equal(sha256(Buffer.from(result.output.text, "base64")), sha256(png));
  assert.equal(completed[0].outputBytes, Buffer.byteLength(png.toString("base64")));
  assert.equal(executor.metrics().totalToolOutputBytes, completed[0].outputBytes);
  const text = await executor.execute({ attemptId: "a", seq: 2, tool: "read_file", arguments: { path: "design/spec.json" } });
  assert.equal(text.output.text, "{\"a\":1}");
});

test("GATE-V9-Docker: base64 read_file round-trips a PNG byte-exactly, the mode-hidden file is absent, and corepack pnpm runs", { skip: unavailable, timeout: 300_000 }, async () => {
  const { DockerSandboxRuntime } = await import(sandbox);
  const { designPathsHiddenByMode, readPreflightedTaskBundle } = await import(contracts);
  const design = readPreflightedTaskBundle(fixture).design;
  const runtime = new DockerSandboxRuntime({ imageReference: PINNED_IMAGE, bundlePath: fixture, writablePaths: ["src/**"], network: "open", packageManager: "pnpm", commandTimeoutMs: 120_000, excludedBundlePaths: ["references", ...designPathsHiddenByMode(design, "image")] });
  await runtime.start(context);
  try {
    const encoded = await runtime.run("read_file", { path: "design/home.png", encoding: "base64" });
    assert.match(encoded, /^[A-Za-z0-9+/]+=*$/);
    assert.equal(sha256(Buffer.from(encoded, "base64")), sha256(readFileSync(join(fixture, "design", "home.png"))));
    assert.equal((await runtime.run("run_command", { command: "ls design" })).trim(), "home.png");
    await assert.rejects(runtime.run("read_file", { path: "design/spec.json" }), /ENOENT/);
    await assert.rejects(runtime.run("run_command", { command: "touch design/x" }), /Read-only file system/);
    // Read-only rootfs: corepack and pnpm only touch /tmp (COREPACK_HOME, store dir, HOME).
    const version = await runtime.run("run_command", { command: "corepack pnpm --version" });
    assert.match(version.trim(), /^10\.34\.4$/m);
    const env = await runtime.run("run_command", { command: "echo $COREPACK_HOME $npm_config_store_dir $HOME" });
    assert.equal(env.trim(), "/tmp/.corepack /tmp/.pnpm-store /tmp");
  } finally { await runtime.cleanup(context); }
});

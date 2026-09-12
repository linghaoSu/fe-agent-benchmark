import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url).pathname;
const goldSrc = join(task, "references", "gold", "src");
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
const json = (r) => { assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); };

/**
 * A stand-in for the `opencode` binary: ignores the prompt, writes the gold app.js into --dir, emits the
 * same JSON event shapes OpenCode prints. Lets the adapter's mirror → run → replay path be exercised
 * end-to-end in the real sandbox without a model call.
 */
function fakeOpencode(root) {
  const bin = join(root, "opencode");
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs"); const path = require("node:path"); const crypto = require("node:crypto");
const dir = process.argv[process.argv.indexOf("--dir") + 1];
fs.cpSync(${JSON.stringify(goldSrc)}, path.join(dir, "src"), { recursive: true });
fs.writeFileSync(path.join(dir, "src", "notes.txt"), "scratch\\n");
// Design renderings must arrive byte-exact; the prompt must point the model at them.
if (fs.existsSync(path.join(dir, "design", "mock.png"))) {
  fs.writeFileSync(path.join(dir, "src", "design-sha.txt"), crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "design", "mock.png"))).digest("hex") + "\\n");
  fs.writeFileSync(path.join(dir, "src", "prompt.txt"), process.argv[process.argv.length - 1]);
}
process.stdout.write(JSON.stringify({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { filePath: path.join(dir, "src/app.js") } } } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "step_finish", part: { reason: "stop", tokens: { input: 1234, output: 56, reasoning: 7 }, cost: 0.01 } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "text", part: { text: "done" } }) + "\\n");
`);
  chmodSync(bin, 0o755);
  return bin;
}

test("GATE-V7.1-Docker: OpenCode adapter mirrors the workspace, replays changes through the Tool Router and reports usage", { skip: unavailable, timeout: 900_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "fab-opencode-"));
  const db = join(root, "eval.sqlite");
  try {
    const created = json(cli("run", "create", task, "--seed", "11", "--sandbox", "docker", "--budget-profile", "agent", "--db", db));
    const executed = spawnSync("pnpm", ["eval", "run", "execute", created.runId, "--agent", "opencode", "--model", "fake/model", "--sandbox", "docker", "--db", db], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, OPENCODE_BINARY: fakeOpencode(root) } });
    assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    const shown = json(cli("run", "show", created.runId, "--db", db));
    assert.equal(shown.run.status, "COMPLETED");
    const result = JSON.parse(shown.result.resultJson);
    assert.equal(result.solved, true, JSON.stringify(result.extensions.gates));
    assert.deepEqual({ input: result.efficiency.inputTokens, output: result.efficiency.outputTokens, cost: result.efficiency.costUsd }, { input: 1234, output: 56, cost: 0.01 });
    assert.deepEqual(result.extensions.agent, { model: "fake/model" });
    const patch = readFileSync(join(root, created.runId, "attempts", "1", "patch.diff"), "utf8");
    assert.match(patch, /\+\+\+ b\/src\/app\.js/); assert.match(patch, /\+\+\+ b\/src\/notes\.txt/);
    const tools = shown.toolCalls.map((c) => c.tool);
    assert.ok(tools.includes("read_file") && tools.includes("write_file") && tools.includes("run_command"));
    assert.ok(shown.toolCalls.every((c) => c.outcomeCode === "TOOL_SUCCEEDED"));
    const events = readFileSync(join(root, created.runId, "attempts", "1", "agent-events.jsonl"), "utf8");
    assert.match(events, /opencode_workspace_mirrored/); assert.match(events, /opencode_finished/);
    assert.doesNotMatch(events, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "scratch path must not leak into events");
  } finally { removeTree(root); }
});

/** Minimal valid 2x2 RGBA PNG (not a text file: contains NUL bytes and invalid UTF-8, so a utf8 round-trip would corrupt it). */
function tinyPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    let crc = 0xffffffff; for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 0xfe, 0x80, 0x10, 255]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("GATE-V9.1-Docker: OpenCode adapter mirrors design/*.png byte-exactly via base64 read_file, lists them in the prompt and never replays them", { skip: unavailable, timeout: 900_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "fab-opencode-design-"));
  const db = join(root, "eval.sqlite");
  try {
    const bundle = join(root, "task");
    cpSync(task, bundle, { recursive: true });
    mkdirSync(join(bundle, "design"));
    const png = tinyPng();
    writeFileSync(join(bundle, "design", "mock.png"), png);
    writeFileSync(join(bundle, "design", "page.json"), JSON.stringify({ layers: [] }));
    writeFileSync(join(bundle, "task.yaml"), readFileSync(join(bundle, "task.yaml"), "utf8") + "design:\n  sketchSpec: design/page.json\n  images: [design/mock.png]\n");
    const created = json(cli("run", "create", bundle, "--seed", "11", "--sandbox", "docker", "--budget-profile", "agent", "--design-mode", "both", "--db", db));
    const executed = spawnSync("pnpm", ["eval", "run", "execute", created.runId, "--agent", "opencode", "--model", "fake/model", "--sandbox", "docker", "--db", db], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, OPENCODE_BINARY: fakeOpencode(root) } });
    assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    const shown = json(cli("run", "show", created.runId, "--db", db));
    assert.equal(shown.run.status, "COMPLETED");
    const patch = readFileSync(join(root, created.runId, "attempts", "1", "patch.diff"), "utf8");
    assert.match(patch, new RegExp(`\\+${createHash("sha256").update(png).digest("hex")}`), "fake opencode must see the PNG byte-exactly");
    assert.doesNotMatch(patch, /^(\+\+\+|diff --git) .*design\/mock\.png/m, "binaries are never replayed back");
    assert.match(patch, /\+设计资料/); assert.match(patch, /\+- design\/mock\.png：设计图，请用 read 工具查看/); assert.match(patch, /\+- design\/page\.json：结构化设计描述（来自 Sketch/);
    const reads = shown.toolCalls.filter((c) => c.tool === "read_file").map((c) => JSON.parse(c.argumentsJson));
    assert.deepEqual(reads.find((a) => a.path === "design/mock.png"), { path: "design/mock.png", encoding: "base64" });
    assert.deepEqual(reads.find((a) => a.path === "design/page.json"), { path: "design/page.json" });
    assert.ok(shown.toolCalls.every((c) => c.outcomeCode === "TOOL_SUCCEEDED"));
    const events = readFileSync(join(root, created.runId, "attempts", "1", "agent-events.jsonl"), "utf8");
    assert.match(events, /"opencode_workspace_mirrored".*"images":1/);
  } finally { removeTree(root); }
});

test("GATE-V7.1-002: budget profile is recorded immutably and the agent profile widens limits", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-profile-"));
  try {
    const db = join(root, "eval.sqlite");
    const a = json(cli("run", "create", task, "--seed", "1", "--sandbox", "fake", "--db", db));
    const b = json(cli("run", "create", task, "--seed", "1", "--sandbox", "fake", "--budget-profile", "agent", "--db", db));
    const inputOf = (id) => JSON.parse(json(cli("run", "show", id, "--db", db)).run.resolvedInputJson);
    const [ia, ib] = [inputOf(a.runId), inputOf(b.runId)];
    assert.equal(ia.budgetProfile, "task"); assert.equal(ib.budgetProfile, "agent");
    assert.ok(ib.budgets.maxAgentSteps >= 200 && ib.budgets.maxWallTimeSeconds >= 900);
    assert.ok(ib.adapterProtocol.maxFrameBytes > ia.adapterProtocol.maxFrameBytes);
    assert.notEqual(a.runId, b.runId);
    assert.equal(cli("run", "create", task, "--seed", "1", "--budget-profile", "bogus", "--db", db).status, 1);
  } finally { removeTree(root); }
});

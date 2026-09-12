/**
 * OpenCode Adapter — runs a real coding agent (OpenCode CLI with any configured provider/model) against a
 * private host-side mirror of the public workspace, then hands every resulting change back through the
 * benchmark's Tool Router so path policy, budgets, redaction and the Docker workspace remain authoritative.
 *
 * Flow: hello → task_context → enumerate + read the public workspace via `run_command`/`read_file` tool
 * requests → materialize into a scratch dir → `opencode run --dir <scratch> --format json` (events forwarded
 * as `event` frames, heartbeats while it runs) → diff scratch against the mirror → `write_file` /
 * `run_command rm` for each change → `complete` with usage in extensions.
 *
 * Known limitation (documented): commands the agent runs during its own self-verification execute on the
 * host scratch copy, not in the sandbox. Evaluation always runs in the sandbox on the tool-routed patch.
 *
 * Dependencies for that self-verification come from, in order: a symlinked `--node-modules`, an offline
 * `npm ci` from `--fixtures` (controlled-proxy bundles), or — for `environment.network: open` tasks, which
 * have neither — a normal online `npm ci` against the real registry, pinned by the lockfile's integrity hashes.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import {
  ADAPTER_PROTOCOL_VERSION,
  FrameCodec,
  type AdapterFrame,
} from "@frontend-agent-benchmark/adapter-protocol";

const runId = process.env.FAB_RUN_ID;
const attemptId = process.env.FAB_ATTEMPT_ID;
if (!runId || !attemptId) throw new Error("FAB_RUN_ID and FAB_ATTEMPT_ID are required");

interface Options {
  model: string;
  opencodeBinary: string;
  /** Host directory whose node_modules is symlinked into the scratch so the agent can run the project's own tests offline. */
  nodeModulesSource?: string;
  /** Host-side copy of the bundle's proxy fixtures, used only to `npm ci --offline` inside the scratch. */
  fixturesSource?: string;
  promptFile?: string;
  maxRuntimeMs: number;
  variant?: string;
  /** Task network mode; online installs are only attempted for `open` Tasks. */
  network: "controlled-proxy" | "open";
  /** The Task's declared design assets and the Run's mode; only the assets the mode shows exist in the workspace. */
  design?: { sketchSpec?: string; images: string[]; mode?: string };
}

function parseOptions(argv: string[]): Options {
  const options: Options = { model: "", opencodeBinary: process.env.OPENCODE_BINARY ?? "opencode", maxRuntimeMs: 20 * 60_000, network: "controlled-proxy" };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, value] = [argv[index]!, argv[index + 1]];
    if (flag === "--model" && value) { options.model = value; index += 1; }
    else if (flag === "--node-modules" && value) { options.nodeModulesSource = value; index += 1; }
    else if (flag === "--fixtures" && value) { options.fixturesSource = value; index += 1; }
    else if (flag === "--prompt-file" && value) { options.promptFile = value; index += 1; }
    else if (flag === "--max-runtime-ms" && value) { options.maxRuntimeMs = Number(value); index += 1; }
    else if (flag === "--variant" && value) { options.variant = value; index += 1; }
    else if (flag === "--network" && (value === "open" || value === "controlled-proxy")) { options.network = value; index += 1; }
    else if (flag === "--design" && value) { options.design = JSON.parse(value); index += 1; }
  }
  if (!options.model) throw new Error("--model <provider/model> is required");
  return options;
}

const options = parseOptions(process.argv.slice(2));
// The host announces its frame cap (agent profile: 1 MiB) so base64 images fit in one tool_result.
const codec = new FrameCodec(Number(process.env.FAB_MAX_FRAME_BYTES) || undefined);
let seq = 0;
let taskId = "";
let taskVersion = 0;
let seed = 0;

function send(type: AdapterFrame["type"], payload: Record<string, unknown>): void {
  const frame = {
    schemaVersion: 1,
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    runId,
    attemptId,
    seq,
    type,
    timestamp: new Date().toISOString(),
    payload,
  } as AdapterFrame;
  seq += 1;
  process.stdout.write(codec.serialize(frame));
}

type ToolResult = { toolCallId: string; status: string; errorCode?: string; output?: Record<string, unknown> };
const pending = new Map<string, (result: ToolResult) => void>();
let toolCounter = 0;

function requestTool(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const toolCallId = `oc-${++toolCounter}`;
  return new Promise((resolveResult) => {
    pending.set(toolCallId, resolveResult);
    send("tool_request", { toolCallId, tool, arguments: args });
  });
}

async function runCommand(command: string): Promise<string> {
  const result = await requestTool("run_command", { command });
  if (result.status !== "succeeded") throw new Error(`run_command failed (${result.errorCode ?? result.status}): ${command}`);
  const output = result.output ?? {};
  if (output.truncated) throw new Error(`run_command output truncated: ${command}`);
  return String(output.text ?? "");
}

/** Routed read; `undefined` when the file is rejected by policy or too large to travel inline (it then stays untouched). */
async function readWorkspaceFile(path: string, encoding?: "base64"): Promise<string | undefined> {
  const result = await requestTool("read_file", encoding ? { path, encoding } : { path });
  if (result.status !== "succeeded") return undefined;
  const output = result.output ?? {};
  if (output.truncated) return undefined;
  return typeof output.text === "string" ? output.text : undefined;
}

/** Text files the agent may edit or read: everything the sandbox exposes except dependency/build output. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/** Dependency/build payloads never travel through the mirror (fixtures/ only exists in controlled-proxy bundles). */
const MIRROR_EXCLUDED = /^(fixtures|node_modules|dist)\//;
const TEXT_EXTENSIONS = /\.(js|mjs|cjs|mts|cts|ts|tsx|jsx|json|yaml|yml|md|html|css|scss|sass|less|txt|svg|lock|env|mjsx|vue)$|^[^.]+$/i;
/** Design renderings: mirrored byte-exactly (read as base64) so a vision model can look at them, never replayed back. */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path.split("/").pop() ?? "");
}

async function listWorkspaceFiles(): Promise<string[]> {
  // Text must fit the agent-profile inline cap (768 KiB); images inflate 4/3 as base64, hence the tighter bound.
  const listing = await runCommand("find . -type f -not -path './node_modules/*' -not -path './dist/*' -not -path './.git/*' -not -path './fixtures/*' \\( -size -700k -not \\( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \\) -o -size -500k \\) | sed 's#^\\./##' | sort");
  return listing.split("\n").map((line) => line.trim()).filter((path) => {
    if (!path || MIRROR_EXCLUDED.test(path)) return false;
    const name = path.split("/").pop() ?? "";
    return IMAGE_EXTENSIONS.test(name) || TEXT_EXTENSIONS.test(name);
  });
}

function walk(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path, base);
    return [relative(base, path)];
  });
}

interface Usage { inputTokens: number; outputTokens: number; reasoningTokens: number; costUsd: number; steps: number; toolUses: number; }

function runOpenCode(scratch: string, prompt: string, usage: Usage, deadline: number): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolveRun) => {
    const args = ["run", "--dir", scratch, "-m", options.model, "--auto", "--pure", "--format", "json", ...(options.variant ? ["--variant", options.variant] : []), prompt];
    const child = spawn(options.opencodeBinary, args, {
      cwd: scratch,
      env: { ...process.env, HOME: process.env.HOME ?? "", PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const heartbeat = setInterval(() => send("heartbeat", {}), 2_000);
    const timer = setTimeout(() => { send("event", { name: "opencode_timeout", data: { maxRuntimeMs: options.maxRuntimeMs } }); child.kill("SIGKILL"); }, Math.max(1_000, deadline - Date.now()));
    createInterface({ input: child.stdout }).on("line", (line) => {
      let event: { type?: string; part?: Record<string, unknown> };
      try { event = JSON.parse(line); } catch { return; }
      const part = event.part ?? {};
      if (event.type === "step_finish") {
        const tokens = (part.tokens ?? {}) as Record<string, number>;
        usage.inputTokens += tokens.input ?? 0; usage.outputTokens += tokens.output ?? 0; usage.reasoningTokens += tokens.reasoning ?? 0;
        usage.costUsd += Number(part.cost ?? 0); usage.steps += 1;
        send("event", { name: "opencode_step", data: { reason: part.reason, tokens: { input: tokens.input ?? 0, output: tokens.output ?? 0, reasoning: tokens.reasoning ?? 0 } } });
      } else if (event.type === "tool_use") {
        usage.toolUses += 1;
        const state = (part.state ?? {}) as Record<string, unknown>;
        const input = (state.input ?? {}) as Record<string, unknown>;
        // Only the tool name and a bounded, path-relativized summary of its input are recorded.
        const summary: Record<string, unknown> = {};
        for (const key of ["filePath", "path", "command", "pattern", "description"]) if (typeof input[key] === "string") summary[key] = String(input[key]).replace(scratch, "<workspace>").slice(0, 200);
        send("event", { name: "opencode_tool", data: { tool: part.tool, status: state.status, input: summary } });
      } else if (event.type === "text") {
        send("event", { name: "opencode_text", data: { text: String(part.text ?? "").slice(0, 500) } });
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); if (stderr.length > 65_536) stderr = stderr.slice(-65_536); });
    child.on("close", (code) => { clearInterval(heartbeat); clearTimeout(timer); resolveRun({ exitCode: code ?? 1, stderr }); });
    child.on("error", (error) => { clearInterval(heartbeat); clearTimeout(timer); stderr += String(error); resolveRun({ exitCode: 127, stderr }); });
  });
}

/** Runs an installer asynchronously so heartbeats keep flowing; a blocking spawnSync would trip the host's heartbeat deadline. */
function spawnWithHeartbeat(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ status: number; stderr: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const heartbeat = setInterval(() => send("heartbeat", {}), 2_000);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); if (stderr.length > 65_536) stderr = stderr.slice(-65_536); });
    const finish = (status: number) => { clearInterval(heartbeat); clearTimeout(timer); resolveResult({ status, stderr }); };
    child.on("close", (code) => finish(code ?? 1));
    child.on("error", (error) => { stderr += String(error); finish(127); });
  });
}

async function installOffline(scratch: string, fixtures: string): Promise<void> {
  const lock = JSON.parse(readFileSync(join(scratch, "package-lock.json"), "utf8")) as { packages?: Record<string, { resolved?: string }> };
  const rewritten = JSON.parse(JSON.stringify(lock)) as typeof lock;
  for (const entry of Object.values(rewritten.packages ?? {})) {
    if (entry.resolved?.startsWith("http://package-proxy:8080/")) entry.resolved = `file:${join(fixtures, entry.resolved.slice("http://package-proxy:8080/".length))}`;
  }
  const lockPath = join(scratch, "package-lock.json");
  const original = readFileSync(lockPath, "utf8");
  writeFileSync(lockPath, JSON.stringify(rewritten));
  const result = await spawnWithHeartbeat("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"], scratch, { ...process.env, npm_config_cache: join(scratch, ".npm-cache") }, 120_000);
  // Restore the exact original lockfile so the agent's diff does not include our rewrite.
  writeFileSync(lockPath, original);
  rmSync(join(scratch, ".npm-cache"), { recursive: true, force: true });
  send("event", { name: "opencode_offline_install", data: { exitCode: result.status, stderr: String(result.stderr ?? "").slice(-500) } });
}

async function installOnline(scratch: string): Promise<void> {
  const result = await spawnWithHeartbeat("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], scratch, { ...process.env, npm_config_cache: join(scratch, ".npm-cache") }, 180_000);
  rmSync(join(scratch, ".npm-cache"), { recursive: true, force: true });
  send("event", { name: "opencode_install", data: { exitCode: result.status, stderr: String(result.stderr ?? "").slice(-500) } });
}

/** pnpm projects (DAO CLI output): corepack resolves the `packageManager` pin; store and corepack cache stay inside the scratch. */
async function installOnlinePnpm(scratch: string): Promise<void> {
  const result = await spawnWithHeartbeat("corepack", ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"], scratch,
    { ...process.env, npm_config_store_dir: join(scratch, ".pnpm-store"), COREPACK_HOME: join(scratch, ".corepack"), COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" }, 300_000);
  for (const cache of [".pnpm-store", ".corepack"]) rmSync(join(scratch, cache), { recursive: true, force: true });
  send("event", { name: "opencode_install", data: { exitCode: result.status, stderr: String(result.stderr ?? "").slice(-500) } });
}

/** Design assets the Run actually exposes (declared by the Task, filtered by the mode, present in the workspace). */
function designAssets(files: string[]): string[] {
  if (!options.design) return [];
  const declared = [...(options.design.sketchSpec ? [options.design.sketchSpec] : []), ...options.design.images];
  return declared.filter((path) => files.includes(path));
}

function describeDesignFiles(files: string[]): string[] {
  const design = designAssets(files).map((path) => isImage(path) ? `- ${path}：设计图，请用 read 工具查看` : `- ${path}：结构化设计描述（来自 Sketch：图层、文案、坐标、组件名）`);
  if (design.length === 0) return [];
  return [
    "",
    "设计资料（只读）：",
    ...design,
    "请严格按设计资料还原页面（布局、文案、颜色、间距、交互）。",
  ];
}

function buildPrompt(readme: string, files: string[], scratch: string): string {
  if (options.promptFile) return readFileSync(options.promptFile, "utf8").replace("{{README}}", readme);
  return [
    "你是一名前端工程师，正在这个仓库中完成下面的需求。仓库已经在当前目录，依赖已安装（node_modules 可用）。",
    "要求：",
    "- 只修改 README 允许的路径；不要修改依赖（package.json / lockfile）、evaluator/ 或 references/。",
    "- 保持现有的 data-testid，README 中提到的 data-testid 必须存在。",
    `- 完成后运行 package.json 中的 test 与 build 脚本确认通过（${existsSync(join(scratch, "pnpm-lock.yaml")) ? "pnpm 项目，用 `corepack pnpm run <script>`" : "用 `npm run <script>`"}）。`,
    "- 不要留下 console.log 或调试代码。",
    "- 完成后直接结束，不需要长篇解释。",
    ...describeDesignFiles(files),
    "",
    "需求（README.md）：",
    readme,
  ].join("\n");
}

async function main(frame: AdapterFrame): Promise<void> {
  taskId = frame.payload.taskId as string;
  taskVersion = frame.payload.taskVersion as number;
  const extensions = frame.payload.extensions as Record<string, unknown> | undefined;
  seed = typeof extensions?.seed === "number" ? extensions.seed : 0;
  send("ready", {});
  send("event", { name: "opencode_started", data: { taskId, taskVersion, seed, model: options.model } });

  const scratch = mkdtempSync(join(tmpdir(), "fab-opencode-"));
  const mirror: Map<string, string> = new Map();
  const usage: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, costUsd: 0, steps: 0, toolUses: 0 };
  const startedAt = Date.now();
  try {
    // 1. Mirror the public workspace through the Tool Router (read policy applies; hidden bundle is not mounted).
    const files = await listWorkspaceFiles();
    const mirrored: string[] = [];
    let images = 0;
    for (const path of files) {
      const image = isImage(path);
      const content = await readWorkspaceFile(path, image ? "base64" : undefined);
      // A design asset that cannot travel inline would silently turn a design Run into a no-design Run.
      if (content === undefined && designAssets([path]).length) throw new Error(`design asset ${path} could not be mirrored (rejected or too large for the inline tool budget)`);
      if (content === undefined) continue;
      const target = join(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      mirrored.push(path);
      if (image) { images += 1; writeFileSync(target, Buffer.from(content, "base64")); continue; }
      mirror.set(path, content);
      writeFileSync(target, content);
    }
    if (options.nodeModulesSource && existsSync(options.nodeModulesSource) && !existsSync(join(scratch, "node_modules"))) {
      symlinkSync(resolve(options.nodeModulesSource), join(scratch, "node_modules"));
    } else if (options.fixturesSource && existsSync(options.fixturesSource) && existsSync(join(scratch, "package-lock.json"))) {
      // Offline install for the agent's own self-verification: the bundle's fixtures directory is the same
      // content the sandbox package proxy serves, so `npm ci` resolves without any registry access.
      await installOffline(scratch, resolve(options.fixturesSource));
    } else if (options.network === "open" && existsSync(join(scratch, "package-lock.json"))) {
      // Open-network tasks ship no fixtures: install from the real registry, pinned by lockfile integrity.
      await installOnline(scratch);
    } else if (options.network === "open" && existsSync(join(scratch, "pnpm-lock.yaml"))) {
      await installOnlinePnpm(scratch);
    }
    send("event", { name: "opencode_workspace_mirrored", data: { files: mirror.size, images } });

    // 2. Run the real agent on the scratch copy.
    const readme = mirror.get("README.md") ?? "";
    const result = await runOpenCode(scratch, buildPrompt(readme, mirrored, scratch), usage, startedAt + options.maxRuntimeMs);
    if (result.stderr) process.stderr.write(result.stderr.slice(-8_192));
    send("event", { name: "opencode_finished", data: { exitCode: result.exitCode, elapsedMs: Date.now() - startedAt, ...usage } });

    // 3. Replay every change through the Tool Router so policy decides what lands in the sandbox.
    let written = 0; let deleted = 0; let rejected = 0;
    const after = new Set(walk(scratch));
    for (const path of after) {
      if (isImage(path)) continue;
      const stat = lstatSync(join(scratch, path));
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
      const content = readFileSync(join(scratch, path), "utf8");
      if (mirror.get(path) === content) continue;
      const outcome = await requestTool("write_file", { path, content });
      if (outcome.status === "succeeded") written += 1; else { rejected += 1; send("event", { name: "opencode_write_rejected", data: { path, errorCode: outcome.errorCode } }); }
    }
    for (const path of mirror.keys()) {
      if (after.has(path)) continue;
      const outcome = await requestTool("run_command", { command: `rm -f -- '${path.replace(/'/g, "'\\''")}'` });
      if (outcome.status === "succeeded") deleted += 1; else rejected += 1;
    }
    send("complete", {
      outcome: "completed",
      summary: `OpenCode ${options.model}: ${written} file(s) written, ${deleted} deleted, ${rejected} rejected, exit ${result.exitCode}`.slice(0, 500),
      patch: "",
      extensions: { usage, model: options.model, exitCode: result.exitCode, written, deleted, rejected },
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

send("hello", { adapter: { id: "opencode", version: "2" }, capabilities: ["event", "read_file", "write_file", "run_command"], extensions: { model: options.model } });

createInterface({ input: process.stdin }).on("line", (line) => {
  const frame = codec.parse(Buffer.from(line));
  if (frame.type === "task_context") {
    main(frame).catch((error) => {
      send("error", { code: "ADAPTER_INTERNAL", message: String(error instanceof Error ? error.message : error).slice(0, 500) });
      process.exit(1);
    });
  } else if (frame.type === "tool_result") {
    const payload = frame.payload as ToolResult;
    const waiter = pending.get(payload.toolCallId);
    if (waiter) { pending.delete(payload.toolCallId); waiter(payload); }
  } else if (frame.type === "shutdown" || frame.type === "cancel") {
    process.exit(0);
  }
});

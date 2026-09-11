import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  lstatSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildCalibrationReport, calibrate, compareRepeats, type ReferenceExpectation } from "@frontend-agent-benchmark/calibration";
import { buildComparisonReport, type ConfigurationSamples, type RunSample } from "@frontend-agent-benchmark/comparison";
import { tmpdir } from "node:os";

import {
  checksumTaskBundle,
  preflightTaskBundle,
  readPreflightedTaskBundle,
  containsObviousCredential,
  validateContractDocument,
  validateContractFile,
  type FrontendAgentEvaluationResult,
} from "@frontend-agent-benchmark/contracts";
import {
  ArtifactStoreError,
  ArtifactStoreFs,
} from "@frontend-agent-benchmark/artifact-store-fs";
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_MAX_FRAME_BYTES,
} from "@frontend-agent-benchmark/adapter-protocol";
import { RunExporter } from "@frontend-agent-benchmark/export-policy";
import {
  currentProcessOwner,
  EXECUTION_LEASE_NAME,
  openStateStore,
  StateStoreError,
} from "@frontend-agent-benchmark/state-store-sqlite";
import {
  NoopAgent,
  NoopEvaluator,
  PipelineEvaluationPhase,
  RunCoordinatorError,
  RunExecutor,
  SubprocessAgentPhase,
} from "@frontend-agent-benchmark/run-coordinator";
import {
  DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES,
  DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES,
} from "@frontend-agent-benchmark/tool-router";
import {
  DockerSandboxRuntime,
  resolvePinnedImageReference,
} from "@frontend-agent-benchmark/sandbox-docker";

/**
 * Budget profiles scale a Task's declared budgets for a class of Agent. Task budgets were sized for the
 * scripted Mock; a real model needs room to read the repo, edit and self-verify. The chosen profile is
 * recorded in the immutable Run input, so only Runs with the same profile are comparable.
 */
const BUDGET_PROFILES = {
  task: (b: { maxWallTimeSeconds: number; maxAgentSteps: number; maxCostUsd: number }) => b,
  agent: (b: { maxWallTimeSeconds: number; maxAgentSteps: number; maxCostUsd: number }) => ({
    maxWallTimeSeconds: Math.max(b.maxWallTimeSeconds, 900),
    maxAgentSteps: Math.max(b.maxAgentSteps, 200),
    maxCostUsd: Math.max(b.maxCostUsd, 5),
  }),
} as const;

// Evaluation commands (install/test/build) are bounded independently of the Agent wall budget.
const EVALUATION_COMMAND_TIMEOUT_MS = 5 * 60_000;
// Upper bound for one recursive `eval run …` child spawned by baseline/calibrate/repeat.
const CHILD_RUN_TIMEOUT_MS = 20 * 60_000;
// Host-only vendored playwright-core matching the pinned browser image; mounted read-only into the browser container only.
const PLAYWRIGHT_RUNTIME_PATH = new URL("../../../tests/fixtures/playwright-runtime", import.meta.url).pathname;
const AXE_SOURCE_PATH = join(PLAYWRIGHT_RUNTIME_PATH, "axe", "axe.min.js");
const usage = [
  "Usage: pnpm eval validate <path>",
  "pnpm eval checksum <task-dir-or-task-yaml>",
  "pnpm eval preflight <task-dir>",
  "pnpm eval run create <task-dir> --seed <n> [--sandbox fake|docker] [--budget-profile task|agent] [--db <path>]",
  "pnpm eval run execute <run-id> [--agent mock] [--mock-scenario build-pass|build-break|functional-break|forbidden-write|react-orders-gold|react-orders-noop|react-orders-mutation-overflow|reference:<name>] [--evaluators noop|pipeline] [--sandbox fake|docker] [--db <path>] | pnpm eval run execute <run-id> --agent opencode --model <provider/model> [--variant <v>] --sandbox docker [--db <path>]",
  "pnpm eval run show [--repair] <run-id> [--db <path>]",
  "pnpm eval run doctor <run-id> [--db <path>]",
  "pnpm eval run export --audience requester <run-id> [--db <path>]",
  "pnpm eval baseline <task-dir> [--scenario react-orders-gold] [--sandbox docker]",
  "pnpm eval calibrate <task-dir> [--sandbox docker] [--out <report.json>]",
  "pnpm eval repeat <task-dir> [--times 2] [--scenario reference:gold] [--seed 1] [--sandbox docker]",
  "pnpm eval batch <task-dir> --seeds 1,2,3 [--scenario reference:gold] [--configuration <id>] [--sandbox docker] [--db <path>]",
  "pnpm eval compare --config <id>=<runId,...> [--config ...] [--k n] [--out report.json] [--db <path>]",
  "pnpm eval suite publish --id <suiteId> --version <n> --type benchmark|regression --task <task-dir> [--task ...] --calibration <reports-dir> --out <suite.json>",
  "pnpm eval suite calibrate --suite <suite.json> --tasks-root <dir> [--out matrix.json] [--sandbox docker]",
].join(" | ");
const documentKindDetection = [
  "validate selects kinds by the first top-level marker in this order:",
  "protocolVersion=adapter-protocol, toolCallId=tool-call, evaluatorResultId=evaluator-result,",
  "artifactManifestId=artifact-manifest, comparisonReportId=comparison-report,",
  "networkPolicyId=network-policy, producerId=producer-record, exportManifestId=export-manifest,",
  "requesterExportResultId=requester-export-result, dataScanResultId=data-scan-result,",
  "dataScanCoveragePolicyId=data-scan-coverage-policy, proxyDiagnosticId=proxy-diagnostic-record,",
  "suiteId=suite, lifecycleStatus=attempt, inputHash or seedSet=run,",
  "dependencyCacheSnapshotId=dependency-cache-snapshot, runId=result; otherwise task",
].join(" ");

interface ParsedArguments {
  positionals: string[];
  options: Record<string, string | true>;
}

function parseArguments(arguments_: string[], booleanOptions: string[] = []): ParsedArguments | undefined {
  const positionals: string[] = [];
  const options: Record<string, string | true> = {};

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    if (argument in options) return undefined;
    if (booleanOptions.includes(argument)) {
      options[argument] = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) return undefined;
    options[argument] = value;
    index += 1;
  }

  return { positionals, options };
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function atomicWrite(path: string, value: string): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const file = openSync(temporaryPath, "wx");
    try {
      writeFileSync(file, value);
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporaryPath, path);

    const parent = openSync(directory, "r");
    try {
      fsyncSync(parent);
    } finally {
      closeSync(parent);
    }
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function databasePath(option: string | true | undefined): string {
  return resolve(process.cwd(), typeof option === "string" ? option : "runs/eval.sqlite");
}

/**
 * Runs the gold reference through the Docker pipeline in a throwaway database and copies the
 * resulting screenshots into the hidden bundle as visual baselines. Screenshots are staged as
 * base64 JSON because the artifact store only scans text; the baseline files are real PNGs.
 */
async function writeBaselines(bundlePath: string, arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (!parsed || parsed.positionals.length !== 0 || Object.keys(parsed.options).some((option) => option !== "--scenario" && option !== "--sandbox")) return false;
  const bundle = resolve(process.cwd(), bundlePath);
  const scenario = (parsed.options["--scenario"] as string | undefined) ?? "react-orders-gold";
  const sandbox = (parsed.options["--sandbox"] as string | undefined) ?? "docker";
  const metadata = readPreflightedTaskBundle(bundle);
  if (!metadata.hiddenBundle) throw new Error("Task declares no evaluation.hiddenBundle");
  const root = mkdtempSync(join(tmpdir(), "fab-baseline-"));
  const databasePath = join(root, "eval.sqlite");
  try {
    const cli = (...args: string[]) => {
      const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: CHILD_RUN_TIMEOUT_MS });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || `eval ${args[0]} failed`);
      return JSON.parse(result.stdout) as Record<string, unknown>;
    };
    const created = cli("run", "create", bundle, "--seed", "1", "--sandbox", sandbox, "--db", databasePath) as { runId: string };
    cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", scenario, "--sandbox", sandbox, "--db", databasePath);
    const shown = cli("run", "show", created.runId, "--db", databasePath) as { run: { status: string }; attempts: Array<{ ordinal: number; lifecycleStatus: string }>; artifacts: Array<{ relativePath: string }> };
    if (shown.run.status !== "COMPLETED") throw new Error(`Baseline Run ended ${shown.run.status}`);
    // A retried Run finalizes on its last Attempt; artifacts in `run show` belong to that Attempt.
    const finalAttempt = [...shown.attempts].sort((left, right) => right.ordinal - left.ordinal)[0];
    if (!finalAttempt || finalAttempt.lifecycleStatus !== "SUCCEEDED") throw new Error("Baseline Run has no succeeded Attempt");
    const attemptDirectory = join(root, created.runId, "attempts", String(finalAttempt.ordinal));
    const pending: Array<{ viewport: string; bytes: Buffer }> = [];
    for (const { name } of metadata.viewports) {
      const path = join(attemptDirectory, "screenshots", `${name}.png.json`);
      if (!existsSync(path)) throw new Error(`Baseline Run produced no screenshot for viewport ${name}`);
      const shot = JSON.parse(readFileSync(path, "utf8")) as { pngBase64?: string; oversized?: boolean };
      if (!shot.pngBase64) throw new Error(`Screenshot for viewport ${name} is ${shot.oversized ? "oversized" : "empty"}; baselines were not written`);
      pending.push({ viewport: name, bytes: Buffer.from(shot.pngBase64, "base64") });
    }
    if (!pending.length) throw new Error("Task declares no viewports; nothing to baseline");
    // Write only after every viewport succeeded so the bundle never holds a mixed old/new baseline set.
    const target = join(bundle, metadata.hiddenBundle, "baselines");
    mkdirSync(target, { recursive: true });
    const written = pending.map(({ viewport, bytes }) => {
      writeFileSync(join(target, `${viewport}.png`), bytes);
      return { viewport, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    });
    console.log(JSON.stringify({ runId: created.runId, attempt: finalAttempt.ordinal, scenario, baselines: written }));
    return true;
  } finally {
    // Frozen snapshots are chmod a-w; restore write bits before removing the throwaway root.
    const unlock = (path: string): void => {
      let stat; try { stat = lstatSync(path); } catch { return; }
      if (stat.isSymbolicLink()) return;
      try { chmodSync(path, stat.mode | 0o700); } catch {}
      if (stat.isDirectory()) for (const name of readdirSync(path)) unlock(join(path, name));
    };
    unlock(root);
    rmSync(root, { recursive: true, force: true });
  }
}

interface ReferenceRun {
  runId: string; result: FrontendAgentEvaluationResult; privateCodes: string[]; status: string;
  fingerprint: { inputHash: string; imageDigest?: string; dependencyCacheSnapshotId?: string; networkPolicyId?: string };
}

/** Runs one Task bundle once through the Docker pipeline with the given mock scenario in a throwaway database. */
function runScenario(bundle: string, scenario: string, sandbox: string, seed: string, root: string): ReferenceRun {
  const databasePath = join(root, `${randomUUID()}.sqlite`);
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: CHILD_RUN_TIMEOUT_MS });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `eval ${args[0]} failed`);
    return JSON.parse(result.stdout) as Record<string, unknown>;
  };
  const created = cli("run", "create", bundle, "--seed", seed, "--sandbox", sandbox, "--db", databasePath) as { runId: string };
  cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", scenario, "--sandbox", sandbox, "--db", databasePath);
  const shown = cli("run", "show", created.runId, "--db", databasePath) as {
    run: { status: string; inputHash: string; resolvedInputJson: string }; result?: { resultJson: string }; producerRecords: Array<{ privateCode: string }>;
    attempts: Array<{ ordinal: number; agentOutcome: string; executionClassification: string }>;
    toolCalls?: Array<{ outcomeCode: string | null }>;
  };
  if (shown.run.status !== "COMPLETED" || !shown.result) throw new Error(`Run for ${scenario} ended ${shown.run.status}`);
  // A calibration sample is only meaningful if the reference was fully applied: the Agent phase completed
  // normally and no write was rejected. Otherwise the pipeline evaluated the starter (or a partial tree).
  const finalAttempt = [...shown.attempts].sort((a, b) => b.ordinal - a.ordinal)[0];
  if (!finalAttempt || finalAttempt.agentOutcome !== "completed" || finalAttempt.executionClassification !== "completed") {
    throw new Error(`Reference ${scenario} was not fully applied: agent outcome ${finalAttempt?.agentOutcome ?? "absent"} / ${finalAttempt?.executionClassification ?? "absent"}`);
  }
  const rejected = (shown.toolCalls ?? []).filter((call) => call.outcomeCode !== "TOOL_SUCCEEDED");
  if (rejected.length) throw new Error(`Reference ${scenario} had ${rejected.length} rejected tool call(s)`);
  const resolvedInput = JSON.parse(shown.run.resolvedInputJson) as { sandbox?: { imageDigest?: string }; dependencyCacheSnapshotId?: string; networkPolicyId?: string };
  return {
    runId: created.runId, status: shown.run.status,
    result: JSON.parse(shown.result.resultJson) as FrontendAgentEvaluationResult,
    privateCodes: shown.producerRecords.map((record) => record.privateCode),
    fingerprint: { inputHash: shown.run.inputHash, imageDigest: resolvedInput.sandbox?.imageDigest, dependencyCacheSnapshotId: resolvedInput.dependencyCacheSnapshotId, networkPolicyId: resolvedInput.networkPolicyId },
  };
}

function unlockTree(path: string): void {
  let stat; try { stat = lstatSync(path); } catch { return; }
  if (stat.isSymbolicLink()) return;
  try { chmodSync(path, stat.mode | 0o700); } catch {}
  if (stat.isDirectory()) for (const name of readdirSync(path)) unlockTree(join(path, name));
}

/**
 * FR-014 calibration: runs every reference under `<bundle>/references/` (gold, alternative, mutations/*) and
 * checks each Result against its `expected.json`. Gold/alternative default to `{ solved: true }`.
 */
async function calibrateTask(bundlePath: string, arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (!parsed || parsed.positionals.length !== 0 || Object.keys(parsed.options).some((option) => option !== "--sandbox" && option !== "--out")) return false;
  const bundle = resolve(process.cwd(), bundlePath);
  const sandbox = (parsed.options["--sandbox"] as string | undefined) ?? "docker";
  const metadata = readPreflightedTaskBundle(bundle);
  const referencesRoot = join(bundle, "references");
  const references: string[] = [];
  for (const entry of readdirSync(referencesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "mutations") {
      for (const mutation of readdirSync(join(referencesRoot, "mutations"), { withFileTypes: true })) if (mutation.isDirectory()) references.push(`mutations/${mutation.name}`);
    } else if (existsSync(join(referencesRoot, entry.name, "src"))) references.push(entry.name);
  }
  const root = mkdtempSync(join(tmpdir(), "fab-calibrate-"));
  try {
    const entries = references.sort().map((reference) => {
      const expectedPath = join(referencesRoot, reference, "expected.json");
      if (!existsSync(expectedPath)) throw new Error(`Reference ${reference} has no expected.json`);
      const expectation = parseReferenceExpectation(JSON.parse(readFileSync(expectedPath, "utf8")), reference);
      const run = runScenario(bundle, `reference:${reference}`, sandbox, "1", root);
      return calibrate({ reference, runId: run.runId, result: run.result, privateCodes: run.privateCodes }, expectation);
    });
    const checksum = checksumTaskBundle(bundle);
    const report = buildCalibrationReport({ id: metadata.taskId, version: metadata.version, bundleChecksum: "bundleChecksum" in checksum ? checksum.bundleChecksum : undefined }, entries, new Date().toISOString());
    const out = parsed.options["--out"] as string | undefined;
    if (out) writeFileSync(resolve(process.cwd(), out), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    process.exitCode = report.passed ? 0 : 1;
    return true;
  } finally { unlockTree(root); rmSync(root, { recursive: true, force: true }); }
}

/** SC-005 deterministic repeat matrix: same bundle, scenario and seed N times; conclusions must be identical. */
async function repeatTask(bundlePath: string, arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (!parsed || parsed.positionals.length !== 0 || Object.keys(parsed.options).some((option) => !["--sandbox", "--times", "--scenario", "--seed"].includes(option))) return false;
  const bundle = resolve(process.cwd(), bundlePath);
  const sandbox = (parsed.options["--sandbox"] as string | undefined) ?? "docker";
  const times = Number(parsed.options["--times"] ?? 2);
  if (!Number.isInteger(times) || times < 2 || times > 10) return false;
  const scenario = (parsed.options["--scenario"] as string | undefined) ?? "reference:gold";
  const seed = (parsed.options["--seed"] as string | undefined) ?? "1";
  const root = mkdtempSync(join(tmpdir(), "fab-repeat-"));
  try {
    const runs = Array.from({ length: times }, () => runScenario(bundle, scenario, sandbox, seed, root));
    const comparison = compareRepeats(runs.map((run) => ({ result: run.result, fingerprint: run.fingerprint, codes: run.privateCodes })));
    console.log(JSON.stringify({ scenario, seed, times, runIds: runs.map((run) => run.runId), identical: comparison.identical, differences: comparison.differences, comparedFields: comparison.compared.length }));
    process.exitCode = comparison.identical ? 0 : 1;
    return true;
  } finally { unlockTree(root); rmSync(root, { recursive: true, force: true }); }
}

function parseReferenceExpectation(value: unknown, reference: string): ReferenceExpectation {
  const fail = (why: string): never => { throw new Error(`references/${reference}/expected.json: ${why}`); };
  if (typeof value !== "object" || value === null) return fail("not an object");
  const document = value as Record<string, unknown>;
  const expect = document.expect;
  if (typeof expect !== "object" || expect === null) return fail("missing expect");
  const record = expect as Record<string, unknown>;
  const known = ["valid", "solved", "gates", "dimensions", "codes", "scoreBelow", "scoreAtLeast"];
  for (const key of Object.keys(record)) if (!known.includes(key)) fail(`unknown expect.${key}`);
  for (const key of ["valid", "solved"]) if (record[key] !== undefined && typeof record[key] !== "boolean") fail(`expect.${key} must be boolean`);
  for (const key of ["gates", "dimensions"]) if (record[key] !== undefined && (typeof record[key] !== "object" || Object.values(record[key] as object).some((v) => typeof v !== "string"))) fail(`expect.${key} must map to strings`);
  for (const key of ["scoreBelow", "scoreAtLeast"]) if (record[key] !== undefined && (typeof record[key] !== "object" || Object.values(record[key] as object).some((v) => typeof v !== "number"))) fail(`expect.${key} must map to numbers`);
  if (record.codes !== undefined && (!Array.isArray(record.codes) || record.codes.some((c) => typeof c !== "string"))) fail("expect.codes must be strings");
  if (Object.keys(record).length === 0) fail("expect declares nothing");
  return { ...(typeof document.description === "string" ? { description: document.description } : {}), expect: record as ReferenceExpectation["expect"] };
}

/**
 * FR-012: run one Task with one Agent configuration once per seed, each as an independent Run in the same
 * database, and print the Run ids grouped under a configuration id for `eval compare`.
 */
async function batchTask(bundlePath: string, arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (!parsed || parsed.positionals.length !== 0 || Object.keys(parsed.options).some((option) => !["--seeds", "--scenario", "--configuration", "--sandbox", "--db"].includes(option))) return false;
  const seedsOption = parsed.options["--seeds"];
  if (typeof seedsOption !== "string") return false;
  const seeds = seedsOption.split(",").map((value) => Number(value.trim()));
  if (!seeds.length || seeds.some((seed) => !Number.isInteger(seed) || seed < 0) || new Set(seeds).size !== seeds.length) return false;
  const bundle = resolve(process.cwd(), bundlePath);
  const scenario = (parsed.options["--scenario"] as string | undefined) ?? "reference:gold";
  const sandbox = (parsed.options["--sandbox"] as string | undefined) ?? "docker";
  const configurationId = (parsed.options["--configuration"] as string | undefined) ?? `mock:${scenario}`;
  const path = databasePath(parsed.options["--db"]);
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: CHILD_RUN_TIMEOUT_MS });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `eval ${args[0]} failed`);
    return JSON.parse(result.stdout) as Record<string, unknown>;
  };
  const runs = seeds.map((seed) => {
    const created = cli("run", "create", bundle, "--seed", String(seed), "--sandbox", sandbox, "--db", path) as { runId: string };
    const executed = cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", scenario, "--sandbox", sandbox, "--db", path) as { status: string };
    return { seed, runId: created.runId, status: executed.status };
  });
  console.log(JSON.stringify({ configurationId, taskBundle: bundle, scenario, runs }));
  process.exitCode = runs.every((run) => run.status === "COMPLETED") ? 0 : 1;
  return true;
}

/**
 * FR-013: `eval compare --config <id>=<runId,runId,...> [--config ...] [--k n] [--out report.json] [--db <path>]`
 * builds a schema-valid comparison report over Runs already in the database.
 */
function compareRuns(arguments_: string[]): boolean {
  const configs: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!argument.startsWith("--") || typeof value !== "string") return false;
    if (argument === "--config") configs.push(value);
    else if (["--k", "--out", "--db"].includes(argument)) options[argument] = value;
    else return false;
    index += 1;
  }
  if (!configs.length) return false;
  const k = options["--k"] === undefined ? undefined : Number(options["--k"]);
  if (k !== undefined && (!Number.isInteger(k) || k < 1)) return false;
  const path = databasePath(options["--db"]);
  const store = openStateStore(path);
  try {
    const configurations: ConfigurationSamples[] = configs.map((spec) => {
      const separator = spec.indexOf("=");
      if (separator <= 0) throw new Error(`--config expects <id>=<runId,...>, got ${spec}`);
      const configurationId = spec.slice(0, separator);
      const runIds = spec.slice(separator + 1).split(",").map((value) => value.trim()).filter(Boolean);
      if (!runIds.length) throw new Error(`--config ${configurationId} lists no Runs`);
      if (new Set(runIds).size !== runIds.length) throw new Error(`--config ${configurationId} repeats a Run id; each sample must be an independent Run`);
      const runs: RunSample[] = runIds.map((runId) => {
        const run = store.runs.find(runId);
        if (!run) throw new Error(`Run ${runId} not found`);
        if (run.status !== "COMPLETED" && run.status !== "FAILED") throw new Error(`Run ${runId} is still ${run.status}`);
        const attempts = store.attempts.list(runId);
        const final = [...attempts].sort((a, b) => b.ordinal - a.ordinal)[0];
        const stored = store.results.find(runId);
        return {
          runId, seed: run.seedSet[0] ?? 0, status: run.status as RunSample["status"],
          result: stored ? JSON.parse(stored.resultJson) as FrontendAgentEvaluationResult : undefined,
          finalClassification: final?.executionClassification ?? "infrastructure_error",
          attempts: attempts.length,
        };
      });
      // Samples in one configuration must be comparable: same Task version and environment, distinct seeds.
      const inputs = runIds.map((runId) => { const run = store.runs.find(runId)!; const resolved = JSON.parse(run.resolvedInputJson) as { sandbox?: { imageDigest?: string }; dependencyCacheSnapshotId?: string }; return { runId, taskId: run.taskId, taskVersion: run.taskVersion, imageDigest: resolved.sandbox?.imageDigest, snapshot: resolved.dependencyCacheSnapshotId, seed: run.seedSet[0] }; });
      const fingerprints = new Set(inputs.map((i) => `${i.taskId}@${i.taskVersion}|${i.imageDigest ?? ""}|${i.snapshot ?? ""}`));
      if (fingerprints.size !== 1) throw new Error(`--config ${configurationId} mixes Runs of different tasks or environments: ${[...fingerprints].join(" vs ")}`);
      if (new Set(inputs.map((i) => i.seed)).size !== inputs.length) throw new Error(`--config ${configurationId} repeats a seed; repeated seeds are not independent samples`);
      return { configurationId, runs };
    });
    if (new Set(configurations.map((c) => c.configurationId)).size !== configurations.length) throw new Error("configuration ids must be unique");
    const allRuns = configurations.flatMap((c) => c.runs.map((r) => r.runId));
    if (new Set(allRuns).size !== allRuns.length) throw new Error("a Run may belong to only one configuration");
    const taskKeys = new Set(configurations.map((c) => { const run = store.runs.find(c.runs[0]!.runId)!; return `${run.taskId}@${run.taskVersion}`; }));
    if (taskKeys.size !== 1) throw new Error(`configurations compare different tasks: ${[...taskKeys].join(", ")}`);
    const report = buildComparisonReport({ comparisonReportId: randomUUID(), createdAt: new Date().toISOString(), configurations, k });
    const validation = validateContractDocument(report, "comparison-report");
    if (!validation.valid) throw new Error(`Comparison report is invalid: ${JSON.stringify(validation.errors).slice(0, 400)}`);
    if (options["--out"]) writeFileSync(resolve(process.cwd(), options["--out"]), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
    return true;
  } finally { store.close(); }
}

/**
 * Publishes an immutable Suite snapshot: `eval suite publish --id <suiteId> --version <n> --type benchmark|regression
 * --task <bundle-dir> [--task ...] --out <suite.json>`. Publication gates (V6): every task must validate,
 * checksum, carry gold + alternative + ≥1 mutation with expectations, and contain no credential pattern in
 * its public or hidden text files; two tasks may not share a bundle checksum. The manifest checksum covers
 * the sorted task list so a republish with any changed bundle produces a different Suite identity.
 */
function publishSuite(arguments_: string[]): boolean {
  const tasks: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!argument.startsWith("--") || typeof value !== "string") return false;
    if (argument === "--task") tasks.push(value);
    else if (["--id", "--version", "--type", "--out", "--calibration"].includes(argument)) options[argument] = value;
    else return false;
    index += 1;
  }
  const version = Number(options["--version"]);
  if (!tasks.length || !options["--id"] || !options["--out"] || !options["--calibration"] || !Number.isInteger(version) || version < 1 || !["benchmark", "regression"].includes(options["--type"] ?? "")) return false;
  const calibrationRoot = resolve(process.cwd(), options["--calibration"]);

  const denied: string[] = [];
  const entries = tasks.map((taskPath) => {
    const bundle = resolve(process.cwd(), taskPath);
    const validation = validateContractFile(join(bundle, "task.yaml"));
    if (!validation.valid) denied.push(`${taskPath}: task.yaml invalid`);
    const checksum = checksumTaskBundle(bundle);
    if (!("bundleChecksum" in checksum)) { denied.push(`${taskPath}: checksum failed`); return undefined; }
    const metadata = readPreflightedTaskBundle(bundle);
    const references = join(bundle, "references");
    const hasMutation = existsSync(join(references, "mutations")) && readdirSync(join(references, "mutations"), { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(join(references, "mutations", entry.name, "expected.json")));
    for (const required of ["gold", "alternative"]) if (!existsSync(join(references, required, "expected.json"))) denied.push(`${taskPath}: references/${required}/expected.json missing`);
    if (!hasMutation) denied.push(`${taskPath}: no mutation with expected.json`);
    if (!metadata.hiddenBundle || !existsSync(join(bundle, metadata.hiddenBundle))) denied.push(`${taskPath}: hidden bundle missing`);
    // Every expectation must parse; a malformed one would silently weaken calibration.
    for (const name of ["gold", "alternative", ...(existsSync(join(references, "mutations")) ? readdirSync(join(references, "mutations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `mutations/${e.name}`) : [])]) {
      const expectedPath = join(references, name, "expected.json");
      if (!existsSync(expectedPath)) continue;
      try { parseReferenceExpectation(JSON.parse(readFileSync(expectedPath, "utf8")), name); } catch (error) { denied.push(`${taskPath}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    // FR-014: publication requires a passing calibration report for exactly this bundle checksum.
    const reportPath = join(calibrationRoot, `${metadata.taskId}.json`);
    if (!existsSync(reportPath)) denied.push(`${taskPath}: no calibration report at ${reportPath}`);
    else {
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as { passed?: boolean; bundleChecksum?: string; mutationCaptureRate?: number; taskId?: string };
      if (report.taskId !== metadata.taskId) denied.push(`${taskPath}: calibration report is for ${report.taskId}`);
      if (report.bundleChecksum !== checksum.bundleChecksum) denied.push(`${taskPath}: calibration report checksum ${report.bundleChecksum ?? "absent"} does not match bundle ${checksum.bundleChecksum}`);
      if (report.passed !== true || report.mutationCaptureRate !== 1) denied.push(`${taskPath}: calibration did not pass with 100% mutation capture`);
    }
    // Hidden-to-public leak gate: no agent-visible file may contain a distinctive line of the hidden spec.
    const hiddenSpec = metadata.hiddenBundle ? join(bundle, metadata.hiddenBundle, "functional.spec.mjs") : undefined;
    if (hiddenSpec && existsSync(hiddenSpec)) {
      const signatures = readFileSync(hiddenSpec, "utf8").split("\n").map((line) => line.trim()).filter((line) => line.length >= 40 && !/^(import|export|\/\/|\*|\})/.test(line));
      const publicRoots = ["src", "tests", "README.md", "index.html", "server.mjs", "scripts"].map((name) => join(bundle, name)).filter(existsSync);
      const publicFiles = (path: string): string[] => lstatSync(path).isDirectory() ? readdirSync(path).flatMap((name) => publicFiles(join(path, name))) : [path];
      for (const file of publicRoots.flatMap(publicFiles)) {
        const text = readFileSync(file, "utf8");
        const leaked = signatures.find((line) => text.includes(line));
        if (leaked) denied.push(`${taskPath}: hidden assertion text appears in public file ${file.slice(bundle.length + 1)}`);
      }
    }
    // Data hygiene (SC-013): no credential-looking text anywhere in the bundle, public or hidden.
    const scan = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) { denied.push(`${taskPath}: symlink ${path}`); continue; }
        if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== "dist") scan(path); continue; }
        if (!/\.(js|mjs|ts|json|yaml|yml|md|html|css|txt)$/.test(entry.name)) continue;
        if (containsObviousCredential(readFileSync(path, "utf8"))) denied.push(`${taskPath}: credential pattern in ${path.slice(bundle.length + 1)}`);
      }
    };
    scan(bundle);
    return { taskId: metadata.taskId, version: metadata.version, bundleChecksum: checksum.bundleChecksum };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const checksums = new Map<string, string>();
  for (const entry of entries) {
    const previous = checksums.get(entry.bundleChecksum);
    if (previous) denied.push(`${entry.taskId} shares a bundle checksum with ${previous}`);
    checksums.set(entry.bundleChecksum, entry.taskId);
  }
  const ids = new Map<string, number>();
  for (const entry of entries) { if (ids.has(entry.taskId)) denied.push(`duplicate task id ${entry.taskId}`); ids.set(entry.taskId, entry.version); }

  if (denied.length) {
    console.log(JSON.stringify({ code: "SUITE_PUBLICATION_DENIED", denied }));
    process.exitCode = 1;
    return true;
  }
  const sorted = [...entries].sort((left, right) => left.taskId.localeCompare(right.taskId));
  const manifestChecksum = `sha256:${createHash("sha256").update(JSON.stringify(sorted)).digest("hex")}`;
  const suite = {
    schemaVersion: 1, suiteId: options["--id"], version, type: options["--type"] as "benchmark" | "regression",
    manifestChecksum, publishedAt: new Date().toISOString(), tasks: sorted,
    extensions: { taskCount: sorted.length },
  };
  const validation = validateContractDocument(suite, "suite");
  if (!validation.valid) throw new Error(`Suite is invalid: ${JSON.stringify(validation.errors).slice(0, 400)}`);
  const out = resolve(process.cwd(), options["--out"]);
  // Immutability is tracked in a ledger next to the output, keyed by suite id + version, independent of --out.
  const ledgerPath = join(dirname(out), `${options["--id"]}.published.json`);
  const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) as Record<string, { manifestChecksum: string; publishedAt: string }> : {};
  const previous = ledger[String(version)];
  if (previous && previous.manifestChecksum !== manifestChecksum) {
    console.log(JSON.stringify({ code: "SUITE_PUBLICATION_DENIED", denied: [`suite ${options["--id"]} v${version} already published with manifest ${previous.manifestChecksum}`] }));
    process.exitCode = 1;
    return true;
  }
  const published = { ...suite, publishedAt: previous?.publishedAt ?? suite.publishedAt };
  ledger[String(version)] = { manifestChecksum, publishedAt: published.publishedAt };
  atomicWrite(out, `${JSON.stringify(published, null, 2)}\n`);
  atomicWrite(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify(published));
  return true;
}

/**
 * All-task calibration matrix: `eval suite calibrate --suite <suite.json> --tasks-root <dir> [--out matrix.json] [--sandbox docker]`
 * runs `calibrate` for every task the Suite lists (bundle checksum must still match) and fails if any task fails.
 */
async function calibrateSuite(arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (!parsed || parsed.positionals.length !== 0 || Object.keys(parsed.options).some((option) => !["--suite", "--tasks-root", "--out", "--sandbox"].includes(option))) return false;
  if (typeof parsed.options["--suite"] !== "string" || typeof parsed.options["--tasks-root"] !== "string") return false;
  const suite = JSON.parse(readFileSync(resolve(process.cwd(), parsed.options["--suite"]), "utf8")) as { suiteId: string; version: number; manifestChecksum: string; tasks: Array<{ taskId: string; version: number; bundleChecksum: string }> };
  const root = mkdtempSync(join(tmpdir(), "fab-suite-calibrate-"));
  try {
    const cli = (...args: string[]) => {
      const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: CHILD_RUN_TIMEOUT_MS * 8 });
      if (result.error) throw result.error;
      return result;
    };
    const rows = suite.tasks.map((entry) => {
      const bundle = resolve(process.cwd(), parsed.options["--tasks-root"] as string, entry.taskId);
      const checksum = checksumTaskBundle(bundle);
      if (!("bundleChecksum" in checksum) || checksum.bundleChecksum !== entry.bundleChecksum) {
        return { taskId: entry.taskId, passed: false, reason: "bundle checksum differs from the published Suite" };
      }
      const out = join(root, `${entry.taskId}.json`);
      const result = cli("calibrate", bundle, "--out", out, ...(parsed.options["--sandbox"] ? ["--sandbox", parsed.options["--sandbox"] as string] : []));
      if (!existsSync(out)) return { taskId: entry.taskId, passed: false, reason: (result.stderr || result.stdout).slice(0, 400) };
      const report = JSON.parse(readFileSync(out, "utf8")) as { passed: boolean; mutationCaptureRate: number; entries: Array<{ reference: string; passed: boolean; mismatches: string[] }> };
      return { taskId: entry.taskId, passed: report.passed, mutationCaptureRate: report.mutationCaptureRate, references: report.entries.length, failures: report.entries.filter((e) => !e.passed).map((e) => ({ reference: e.reference, mismatches: e.mismatches })) };
    });
    const matrix = { schemaVersion: 1, suiteId: suite.suiteId, suiteVersion: suite.version, manifestChecksum: suite.manifestChecksum, createdAt: new Date().toISOString(), tasks: rows, passed: rows.length > 0 && rows.every((row) => row.passed) };
    if (typeof parsed.options["--out"] === "string") writeFileSync(resolve(process.cwd(), parsed.options["--out"]), `${JSON.stringify(matrix, null, 2)}\n`);
    console.log(JSON.stringify(matrix));
    process.exitCode = matrix.passed ? 0 : 1;
    return true;
  } finally { unlockTree(root); rmSync(root, { recursive: true, force: true }); }
}

/** `reference:<name>` selects `<bundle>/references/<name>/src` (e.g. gold, alternative, mutations/drop-search-handler). */
function referenceScenario(value: string): string | undefined {
  const match = /^reference:([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?)$/.exec(value);
  return match?.[1];
}

function createRun(arguments_: string[]): boolean {
  const parsed = parseArguments(arguments_);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || typeof parsed.options["--seed"] !== "string"
    || Object.keys(parsed.options).some((option) => (
      option !== "--seed" && option !== "--sandbox" && option !== "--db" && option !== "--budget-profile"
    ))
    || (parsed.options["--sandbox"] !== undefined
      && parsed.options["--sandbox"] !== "fake"
      && parsed.options["--sandbox"] !== "docker")
    || (parsed.options["--budget-profile"] !== undefined && !(parsed.options["--budget-profile"] as string in BUDGET_PROFILES))
  ) return false;

  const seed = Number(parsed.options["--seed"]);
  if (!Number.isSafeInteger(seed)) return false;
  const budgetProfile = (parsed.options["--budget-profile"] as keyof typeof BUDGET_PROFILES | undefined) ?? "task";

  const taskDirectory = resolve(process.cwd(), parsed.positionals[0]!);
  const preflight = preflightTaskBundle(taskDirectory);
  if (preflight.preflight === "rejected") {
    console.log(JSON.stringify(preflight));
    process.exitCode = 1;
    return true;
  }

  const checksum = checksumTaskBundle(taskDirectory);
  if (!("bundleChecksum" in checksum)) {
    console.log(JSON.stringify(checksum));
    process.exitCode = 1;
    return true;
  }

  const metadata = readPreflightedTaskBundle(taskDirectory);
  const sandboxRunner = parsed.options["--sandbox"] === "docker" ? "docker" : "fake";
  const imageReference = resolvePinnedImageReference({
    taskImage: metadata.environmentImage,
    snapshotImageDigest: metadata.imageDigest,
  });
  const resolvedInput = {
    schemaVersions: { run: 1, task: metadata.schemaVersion },
    task: { id: metadata.taskId, version: metadata.version },
    bundleChecksum: checksum.bundleChecksum,
    seed,
    budgets: BUDGET_PROFILES[budgetProfile](metadata.budgets),
    budgetProfile,
    permissions: metadata.permissions,
    evaluation: { commands: metadata.commands, buildOutputPaths: metadata.buildOutputPaths, appPort: metadata.appPort, hiddenBundle: metadata.hiddenBundle, requiredGates: { criticalFunctionalTests: metadata.criticalFunctionalTests }, viewports: metadata.viewports, locale: metadata.locale, timezone: metadata.timezone, weights: metadata.weights, visualMismatchThreshold: metadata.visualMismatchThreshold },
    sandbox: {
      runner: sandboxRunner,
      imageReference,
      imageDigest: imageReference.slice(imageReference.indexOf("@") + 1),
      user: "1000:1000",
      resources: { memoryBytes: 536_870_912, cpus: 1, pidsLimit: 128 },
    },
    // A real agent mirrors the workspace through read_file, so the agent profile allows whole source files inline.
    toolRouter: budgetProfile === "agent"
      ? { maxTotalToolOutputBytes: 32 * DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES, maxInlineToolOutputBytes: 768 * 1024 }
      : { maxTotalToolOutputBytes: DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES, maxInlineToolOutputBytes: DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES },
    adapterProtocol: {
      maxFrameBytes: budgetProfile === "agent" ? 1_048_576 : DEFAULT_MAX_FRAME_BYTES,
      heartbeatTimeoutSeconds: DEFAULT_HEARTBEAT_TIMEOUT_MS / 1_000,
    },
    dependencyLockHash: metadata.dependencyLockHash,
    dependencyCacheSnapshotId: metadata.dependencyCacheSnapshotId,
    proxyConfigurationHash: metadata.proxyConfigurationHash,
    networkPolicyId: `network-policy:${checksum.bundleChecksum}`,
    services: {
      ...(metadata.mockApi ? { mockApi: metadata.mockApi } : {}),
      ...(metadata.packageProxy ? { packageProxy: metadata.packageProxy } : {}),
    },
  };
  const resolvedInputJson = JSON.stringify(resolvedInput);
  const inputHash = sha256(resolvedInputJson);
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const path = databasePath(parsed.options["--db"]);
  const store = openStateStore(path);

  try {
    store.tasks.register({
      taskId: metadata.taskId,
      version: metadata.version,
      bundleChecksum: checksum.bundleChecksum,
      schemaVersion: metadata.schemaVersion,
      path: taskDirectory,
    });
    store.runs.create({
      runId,
      inputHash,
      resolvedInputJson,
      inputJsonChecksum: sha256(resolvedInputJson),
      taskId: metadata.taskId,
      taskVersion: metadata.version,
      bundleChecksum: checksum.bundleChecksum,
      seedSet: [seed],
      budgetsJson: JSON.stringify(metadata.budgets),
      dependencyLockHash: metadata.dependencyLockHash,
      dependencyCacheSnapshotId: metadata.dependencyCacheSnapshotId,
      createdAt,
      transitionReason: "preflight passed",
    });
  } finally {
    store.close();
  }

  atomicWrite(join(dirname(path), runId, "input.json"), resolvedInputJson);
  console.log(JSON.stringify({ runId, inputHash, status: "PREFLIGHT" }));
  return true;
}

function showRun(arguments_: string[]): boolean {
  const parsed = parseArguments(arguments_, ["--repair"]);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || Object.keys(parsed.options).some((option) => option !== "--repair" && option !== "--db")
  ) return false;

  const path = databasePath(parsed.options["--db"]);
  const store = openStateStore(path);
  const runId = parsed.positionals[0]!;
  try {
    const run = store.runs.find(runId);
    if (!run) throw new StateStoreError("RUN_NOT_FOUND", `Run ${runId} was not found`);
    const transitions = store.runs.transitions(runId);
    const attempts = store.attempts.list(runId);
    const attemptTransitions = attempts.flatMap(({ attemptId }) => (
      store.attempts.transitions(attemptId)
    ));
    const producerRecords = store.producers.forRun(runId);
    const adapterFrames = attempts.flatMap(({ attemptId }) => store.adapterFrames.forAttempt(attemptId));
    const toolCalls = attempts.flatMap(({ attemptId }) => store.toolCalls.forAttempt(attemptId));
    const artifacts = store.artifacts.forRun(runId);
    const manifests = store.manifests.forRun(runId);
    const result = store.results.find(runId);
    if (parsed.options["--repair"] === true) {
      atomicWrite(join(dirname(path), runId, "input.json"), run.resolvedInputJson);
    }
    console.log(JSON.stringify({
      run,
      transitions,
      attempts,
      attemptTransitions,
      producerRecords,
      adapterFrames,
      toolCalls,
      artifacts,
      manifests,
      result,
    }));
  } finally {
    store.close();
  }
  return true;
}

function doctorRun(arguments_: string[]): boolean {
  const parsed = parseArguments(arguments_);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || Object.keys(parsed.options).some((option) => option !== "--db")
  ) return false;

  const path = databasePath(parsed.options["--db"]);
  const store = openStateStore(path);
  const owner = currentProcessOwner();
  let acquired = false;
  try {
    store.leases.acquire(EXECUTION_LEASE_NAME, owner);
    acquired = true;
    const report = new ArtifactStoreFs({ runsRoot: dirname(path), store })
      .reconcile(parsed.positionals[0]!);
    console.log(JSON.stringify(report));
  } finally {
    if (acquired) store.leases.release(EXECUTION_LEASE_NAME, owner);
    store.close();
  }
  return true;
}

function exportRun(arguments_: string[]): boolean {
  const parsed = parseArguments(arguments_);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || parsed.options["--audience"] !== "requester"
    || Object.keys(parsed.options).some((option) => option !== "--audience" && option !== "--db")
  ) return false;

  const path = databasePath(parsed.options["--db"]);
  const store = openStateStore(path);
  try {
    const result = new RunExporter({ runsRoot: dirname(path), store })
      .export(parsed.positionals[0]!);
    console.log(JSON.stringify(result));
    process.exitCode = result.outcome === "passed" ? 0 : 1;
  } finally {
    store.close();
  }
  return true;
}

async function executeRun(arguments_: string[]): Promise<boolean> {
  const parsed = parseArguments(arguments_);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || Object.keys(parsed.options).some((option) => (
      option !== "--agent" && option !== "--mock-scenario" && option !== "--evaluators" && option !== "--sandbox" && option !== "--db" && option !== "--model" && option !== "--variant"
    ))
    || (parsed.options["--agent"] !== undefined && parsed.options["--agent"] !== "mock" && parsed.options["--agent"] !== "opencode")
    || (parsed.options["--agent"] === "opencode" && typeof parsed.options["--model"] !== "string")
    || (parsed.options["--mock-scenario"] !== undefined
      && parsed.options["--mock-scenario"] !== "docker-residual"
      && !["docker-unsafe", "build-pass", "build-break", "functional-break", "forbidden-write", "react-orders-gold", "react-orders-noop", "react-orders-mutation-overflow"].includes(parsed.options["--mock-scenario"] as string)
      && !referenceScenario(parsed.options["--mock-scenario"] as string))
    || (parsed.options["--evaluators"] !== undefined && parsed.options["--evaluators"] !== "noop" && parsed.options["--evaluators"] !== "pipeline")
    || (parsed.options["--sandbox"] !== undefined
      && parsed.options["--sandbox"] !== "fake"
      && parsed.options["--sandbox"] !== "docker")
  ) return false;

  const path = databasePath(parsed.options["--db"]);
  const store = openStateStore(path);
  try {
    const runId = parsed.positionals[0]!;
    const storedRun = store.runs.find(runId);
    if (!storedRun) throw new StateStoreError("RUN_NOT_FOUND", `Run ${runId} was not found`);
    const resolved = JSON.parse(storedRun.resolvedInputJson) as {
      adapterProtocol?: { maxFrameBytes: number; heartbeatTimeoutSeconds: number };
      permissions?: { writablePaths: string[]; forbiddenPaths: string[]; allowDependencyChanges: boolean };
      evaluation?: { commands: { install: string; typecheck: string; lint: string; test: string; build: string; start: string }; buildOutputPaths: string[]; appPort?: number; hiddenBundle?: string; viewports?: Array<{ name: string; width: number; height: number }>; locale?: string; timezone?: string; weights?: Record<string, number>; visualMismatchThreshold?: number; requiredGates?: { criticalFunctionalTests?: boolean } };
      budgets?: { maxWallTimeSeconds: number };
      sandbox?: {
        runner: "fake" | "docker";
        imageReference: string;
        resources: { memoryBytes: number; cpus: number; pidsLimit: number };
      };
      services?: { mockApi?: { image: string; command: string[]; port: number }; packageProxy?: { image: string; command: string[]; port: number; fixtureDirectory: string } };
    };
    const protocol = resolved.adapterProtocol;
    if (parsed.options["--agent"] === "mock" && !protocol) {
      throw new StateStoreError(
        "ADAPTER_PROTOCOL_CONFIG_MISSING",
        `Run ${runId} does not record Adapter protocol limits`,
      );
    }
    const sandboxRunner = parsed.options["--sandbox"] ?? resolved.sandbox?.runner ?? "fake";
    if (resolved.sandbox && sandboxRunner !== resolved.sandbox.runner) {
      throw new StateStoreError(
        "SANDBOX_RUNNER_MISMATCH",
        `Run ${runId} records Sandbox runner ${resolved.sandbox.runner}`,
      );
    }
    const artifacts = new ArtifactStoreFs({ runsRoot: dirname(path), store });
    const task = store.tasks.find(storedRun.taskId, storedRun.taskVersion);
    if (!task) throw new StateStoreError("TASK_NOT_FOUND", "Run Task Bundle was not found");
    const sandbox = sandboxRunner === "docker"
      ? new DockerSandboxRuntime({
          imageReference: resolved.sandbox!.imageReference,
          bundlePath: task.path,
          writablePaths: resolved.permissions?.writablePaths ?? [],
          forbiddenPaths: resolved.permissions?.forbiddenPaths ?? [],
          buildOutputPaths: resolved.evaluation?.buildOutputPaths ?? [], excludedBundlePaths: [...(resolved.evaluation?.hiddenBundle ? [resolved.evaluation.hiddenBundle.split("/")[0]!] : []), "references"],
          resources: resolved.sandbox!.resources,
          commandTimeoutMs: (resolved.budgets?.maxWallTimeSeconds ?? 30) * 1_000,
          services: resolved.services,
        })
      : undefined;
    const agentCommand = parsed.options["--agent"] === "opencode"
      ? {
          command: process.execPath,
          args: [
            new URL("../../../packages/adapter-opencode/dist/index.js", import.meta.url).pathname,
            "--model", parsed.options["--model"] as string,
            "--node-modules", join(task.path, "node_modules"),
            "--fixtures", join(task.path, "fixtures"),
            "--max-runtime-ms", String((resolved.budgets?.maxWallTimeSeconds ?? 900) * 1_000 - 60_000),
            ...(typeof parsed.options["--variant"] === "string" ? ["--variant", parsed.options["--variant"] as string] : []),
          ],
          // OpenCode needs its own config/auth and the PATH to find `opencode`; nothing task-specific leaks in.
          env: { HOME: process.env.HOME ?? "", PATH: process.env.PATH ?? "", OPENCODE_BINARY: process.env.OPENCODE_BINARY ?? "opencode", ...(process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {}) },
        }
      : undefined;
    const agent = parsed.options["--agent"] === "opencode" && agentCommand
      ? new SubprocessAgentPhase({
          store,
          artifacts,
          command: agentCommand,
          maxFrameBytes: protocol!.maxFrameBytes,
          heartbeatTimeoutMs: protocol!.heartbeatTimeoutSeconds * 1_000,
          ...(sandbox ? { runner: sandbox } : {}),
          ...(sandbox ? { toolRouter: { isClosed: () => sandbox.isFrozen({
            runId,
            attemptId: store.attempts.list(runId).at(-1)?.attemptId ?? "",
            ordinal: 0,
            seed: 0,
          }) } } : {}),
        })
      : parsed.options["--agent"] === "mock"
      ? new SubprocessAgentPhase({
          store,
          artifacts,
          command: {
            command: process.execPath,
            args: [
              new URL("../../../packages/adapter-mock/dist/index.js", import.meta.url).pathname,
              ...(typeof parsed.options["--mock-scenario"] === "string"
                ? (referenceScenario(parsed.options["--mock-scenario"] as string)
                  ? ["--reference", join(task.path, "references", referenceScenario(parsed.options["--mock-scenario"] as string)!)]
                  : [`--${parsed.options["--mock-scenario"]}`, ...(["react-orders-gold", "react-orders-mutation-overflow"].includes(parsed.options["--mock-scenario"] as string) ? [join(task.path, "references", "gold")] : [])])
                : sandbox ? ["--docker-workspace"] : []),
            ],
          },
          maxFrameBytes: protocol!.maxFrameBytes,
          heartbeatTimeoutMs: protocol!.heartbeatTimeoutSeconds * 1_000,
          ...(sandbox ? { runner: sandbox } : {}),
          ...(sandbox ? { toolRouter: { isClosed: () => sandbox.isFrozen({
            runId,
            attemptId: store.attempts.list(runId).at(-1)?.attemptId ?? "",
            ordinal: 0,
            seed: 0,
          }) } } : {}),
        })
      : new NoopAgent();
    const evaluatorMode = parsed.options["--evaluators"] ?? (sandbox ? "pipeline" : "noop");
    const evaluator = evaluatorMode === "pipeline" ? new PipelineEvaluationPhase({
      artifacts,
      snapshotPath: (context) => `${artifacts.attemptStagingDirectory(context.runId, context.attemptId)}/snapshot`,
      runtime: (_context, workspace) => new DockerSandboxRuntime({ imageReference: resolved.sandbox!.imageReference, bundlePath: workspace, writablePaths: resolved.permissions?.writablePaths ?? [], forbiddenPaths: resolved.permissions?.forbiddenPaths ?? [], buildOutputPaths: resolved.evaluation?.buildOutputPaths ?? [], resources: resolved.sandbox!.resources, commandTimeoutMs: EVALUATION_COMMAND_TIMEOUT_MS, services: resolved.services, playwrightRuntimePath: PLAYWRIGHT_RUNTIME_PATH, appNetwork: Boolean(resolved.evaluation?.appPort) }),
      // An Attempt with no workspace changes stages no patch.diff; integrity then evaluates an empty patch.
      patch: (context) => {
        const path = `${artifacts.attemptStagingDirectory(context.runId, context.attemptId)}/patch.diff`;
        return existsSync(path) ? readFileSync(path, "utf8") : "";
      },
      policy: { writablePaths: resolved.permissions?.writablePaths ?? [], forbiddenPaths: resolved.permissions?.forbiddenPaths ?? [], allowDependencyChanges: resolved.permissions?.allowDependencyChanges ?? false },
      commands: resolved.evaluation?.commands ?? {},
      app: resolved.evaluation?.appPort ? { command: resolved.evaluation.commands.start, port: resolved.evaluation.appPort } : undefined,
      hiddenBundlePath: resolved.evaluation?.hiddenBundle ? join(task.path, resolved.evaluation.hiddenBundle) : undefined,
      quality: {
        viewports: resolved.evaluation?.viewports ?? [],
        locale: resolved.evaluation?.locale,
        timezone: resolved.evaluation?.timezone,
        visualMismatchThreshold: resolved.evaluation?.visualMismatchThreshold,
        axeSource: existsSync(AXE_SOURCE_PATH) ? readFileSync(AXE_SOURCE_PATH, "utf8") : undefined,
      },
    }) : new NoopEvaluator();
    const run = await new RunExecutor({
      store,
      artifacts,
      agent,
      evaluator,
      ...(sandbox ? { sandboxRuntime: sandbox } : {}),
    }).execute(runId);
    console.log(JSON.stringify({ runId, status: run.status }));
  } finally {
    store.close();
  }
  return true;
}

function printUsage(): void {
  console.log(JSON.stringify({
    valid: false,
    errors: [{
      code: "cli.usage",
      location: "",
      message: `${usage}. ${documentKindDetection}.`,
    }],
  }));
  process.exitCode = 1;
}

const [command, inputPath, ...extraArguments] = process.argv.slice(2);

try {
  if ((command === "help" || command === "--help") && !inputPath) {
    console.log(JSON.stringify({ usage, documentKindDetection }));
  } else if (command === "validate" && inputPath && extraArguments.length === 0) {
    const result = validateContractFile(resolve(process.cwd(), inputPath));
    console.log(JSON.stringify(result));
    process.exitCode = result.valid ? 0 : 1;
  } else if (command === "checksum" && inputPath && extraArguments.length === 0) {
    const result = checksumTaskBundle(resolve(process.cwd(), inputPath));
    console.log(JSON.stringify(result));
    process.exitCode = "bundleChecksum" in result ? 0 : 1;
  } else if (command === "preflight" && inputPath && extraArguments.length === 0) {
    const result = preflightTaskBundle(resolve(process.cwd(), inputPath));
    console.log(JSON.stringify(result));
    process.exitCode = result.preflight === "passed" ? 0 : 1;
  } else if (command === "run" && inputPath === "create" && createRun(extraArguments)) {
    // Handled above.
  } else if (command === "run" && inputPath === "execute" && await executeRun(extraArguments)) {
    // Handled above.
  } else if (command === "run" && inputPath === "show" && showRun(extraArguments)) {
    // Handled above.
  } else if (command === "run" && inputPath === "doctor" && doctorRun(extraArguments)) {
    // Handled above.
  } else if (command === "run" && inputPath === "export" && exportRun(extraArguments)) {
    // Handled above.
  } else if (command === "baseline" && inputPath && await writeBaselines(inputPath, extraArguments)) {
    // Handled above.
  } else if (command === "calibrate" && inputPath && await calibrateTask(inputPath, extraArguments)) {
    // Handled above.
  } else if (command === "repeat" && inputPath && await repeatTask(inputPath, extraArguments)) {
    // Handled above.
  } else if (command === "batch" && inputPath && await batchTask(inputPath, extraArguments)) {
    // Handled above.
  } else if (command === "compare" && compareRuns([...(inputPath ? [inputPath] : []), ...extraArguments])) {
    // Handled above.
  } else if (command === "suite" && inputPath === "publish" && publishSuite(extraArguments)) {
    // Handled above.
  } else if (command === "suite" && inputPath === "calibrate" && await calibrateSuite(extraArguments)) {
    // Handled above.
  } else {
    printUsage();
  }
} catch (error) {
  console.log(JSON.stringify({
    code: error instanceof StateStoreError
      || error instanceof RunCoordinatorError
      || error instanceof ArtifactStoreError
      ? error.code
      : "RUN_COMMAND_FAILED",
    message: error instanceof Error ? error.message : "Run command failed",
  }));
  process.exitCode = 1;
}

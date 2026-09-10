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
import { tmpdir } from "node:os";

import {
  checksumTaskBundle,
  preflightTaskBundle,
  readPreflightedTaskBundle,
  validateContractFile,
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

// Evaluation commands (install/test/build) are bounded independently of the Agent wall budget.
const EVALUATION_COMMAND_TIMEOUT_MS = 5 * 60_000;
// Host-only vendored playwright-core matching the pinned browser image; mounted read-only into the browser container only.
const PLAYWRIGHT_RUNTIME_PATH = new URL("../../../tests/fixtures/playwright-runtime", import.meta.url).pathname;
const AXE_SOURCE_PATH = join(PLAYWRIGHT_RUNTIME_PATH, "axe", "axe.min.js");
const usage = [
  "Usage: pnpm eval validate <path>",
  "pnpm eval checksum <task-dir-or-task-yaml>",
  "pnpm eval preflight <task-dir>",
  "pnpm eval run create <task-dir> --seed <n> [--sandbox fake|docker] [--db <path>]",
  "pnpm eval run execute <run-id> [--agent mock] [--mock-scenario build-pass|build-break|functional-break|forbidden-write|react-orders-gold|react-orders-noop|react-orders-mutation-overflow] [--evaluators noop|pipeline] [--sandbox fake|docker] [--db <path>]",
  "pnpm eval run show [--repair] <run-id> [--db <path>]",
  "pnpm eval run doctor <run-id> [--db <path>]",
  "pnpm eval run export --audience requester <run-id> [--db <path>]",
  "pnpm eval baseline <task-dir> [--scenario react-orders-gold] [--sandbox docker]",
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
      const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || `eval ${args[0]} failed`);
      return JSON.parse(result.stdout) as Record<string, unknown>;
    };
    const created = cli("run", "create", bundle, "--seed", "1", "--sandbox", sandbox, "--db", databasePath) as { runId: string };
    cli("run", "execute", created.runId, "--agent", "mock", "--mock-scenario", scenario, "--sandbox", sandbox, "--db", databasePath);
    const shown = cli("run", "show", created.runId, "--db", databasePath) as { run: { status: string }; artifacts: Array<{ relativePath: string }> };
    if (shown.run.status !== "COMPLETED") throw new Error(`Baseline Run ended ${shown.run.status}`);
    const attemptDirectory = join(root, created.runId, "attempts", "1");
    const target = join(bundle, metadata.hiddenBundle, "baselines");
    mkdirSync(target, { recursive: true });
    const written: Array<{ viewport: string; sha256: string }> = [];
    for (const artifact of shown.artifacts.filter(({ relativePath }) => /^screenshots\/.+\.png\.json$/.test(relativePath))) {
      const shot = JSON.parse(readFileSync(join(attemptDirectory, artifact.relativePath), "utf8")) as { pngBase64?: string; sha256?: string };
      if (!shot.pngBase64) continue;
      const viewport = artifact.relativePath.slice("screenshots/".length, -".png.json".length);
      const bytes = Buffer.from(shot.pngBase64, "base64");
      writeFileSync(join(target, `${viewport}.png`), bytes);
      written.push({ viewport, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
    }
    console.log(JSON.stringify({ runId: created.runId, scenario, baselines: written }));
    process.exitCode = written.length ? 0 : 1;
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

function createRun(arguments_: string[]): boolean {
  const parsed = parseArguments(arguments_);
  if (
    !parsed
    || parsed.positionals.length !== 1
    || typeof parsed.options["--seed"] !== "string"
    || Object.keys(parsed.options).some((option) => (
      option !== "--seed" && option !== "--sandbox" && option !== "--db"
    ))
    || (parsed.options["--sandbox"] !== undefined
      && parsed.options["--sandbox"] !== "fake"
      && parsed.options["--sandbox"] !== "docker")
  ) return false;

  const seed = Number(parsed.options["--seed"]);
  if (!Number.isSafeInteger(seed)) return false;

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
    budgets: metadata.budgets,
    permissions: metadata.permissions,
    evaluation: { commands: metadata.commands, buildOutputPaths: metadata.buildOutputPaths, appPort: metadata.appPort, hiddenBundle: metadata.hiddenBundle, requiredGates: { criticalFunctionalTests: metadata.criticalFunctionalTests }, viewports: metadata.viewports, locale: metadata.locale, timezone: metadata.timezone, weights: metadata.weights, visualMismatchThreshold: metadata.visualMismatchThreshold },
    sandbox: {
      runner: sandboxRunner,
      imageReference,
      imageDigest: imageReference.slice(imageReference.indexOf("@") + 1),
      user: "1000:1000",
      resources: { memoryBytes: 536_870_912, cpus: 1, pidsLimit: 128 },
    },
    toolRouter: {
      maxTotalToolOutputBytes: DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES,
      maxInlineToolOutputBytes: DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES,
    },
    adapterProtocol: {
      maxFrameBytes: DEFAULT_MAX_FRAME_BYTES,
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
      option !== "--agent" && option !== "--mock-scenario" && option !== "--evaluators" && option !== "--sandbox" && option !== "--db"
    ))
    || (parsed.options["--agent"] !== undefined && parsed.options["--agent"] !== "mock")
    || (parsed.options["--mock-scenario"] !== undefined
      && parsed.options["--mock-scenario"] !== "docker-residual"
      && !["docker-unsafe", "build-pass", "build-break", "functional-break", "forbidden-write", "react-orders-gold", "react-orders-noop", "react-orders-mutation-overflow"].includes(parsed.options["--mock-scenario"] as string))
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
    const agent = parsed.options["--agent"] === "mock"
      ? new SubprocessAgentPhase({
          store,
          artifacts,
          command: {
            command: process.execPath,
            args: [
              new URL("../../../packages/adapter-mock/dist/index.js", import.meta.url).pathname,
              ...(typeof parsed.options["--mock-scenario"] === "string"
                ? [`--${parsed.options["--mock-scenario"]}`, ...(["react-orders-gold", "react-orders-mutation-overflow"].includes(parsed.options["--mock-scenario"] as string) ? [join(task.path, "references", "gold")] : [])]
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

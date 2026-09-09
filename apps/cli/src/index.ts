import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

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

const usage = [
  "Usage: pnpm eval validate <path>",
  "pnpm eval checksum <task-dir-or-task-yaml>",
  "pnpm eval preflight <task-dir>",
  "pnpm eval run create <task-dir> --seed <n> [--sandbox fake|docker] [--db <path>]",
  "pnpm eval run execute <run-id> [--agent mock] [--sandbox fake|docker] [--db <path>]",
  "pnpm eval run show [--repair] <run-id> [--db <path>]",
  "pnpm eval run doctor <run-id> [--db <path>]",
  "pnpm eval run export --audience requester <run-id> [--db <path>]",
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
      option !== "--agent" && option !== "--sandbox" && option !== "--db"
    ))
    || (parsed.options["--agent"] !== undefined && parsed.options["--agent"] !== "mock")
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
      permissions?: { writablePaths: string[]; forbiddenPaths: string[] };
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
              ...(sandbox ? ["--docker-workspace"] : []),
            ],
          },
          maxFrameBytes: protocol!.maxFrameBytes,
          heartbeatTimeoutMs: protocol!.heartbeatTimeoutSeconds * 1_000,
          ...(sandbox ? { runner: sandbox } : {}),
        })
      : new NoopAgent();
    const run = await new RunExecutor({
      store,
      artifacts,
      agent,
      evaluator: new NoopEvaluator(),
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

import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { ArtifactStoreFs } from "@frontend-agent-benchmark/artifact-store-fs";
import {
  AdapterHostError,
  type AdapterCommand,
  type AdapterFrame,
  type RoutedToolResponse,
  SubprocessAdapterHost,
} from "@frontend-agent-benchmark/adapter-protocol";
import {
  type FrontendAgentEvaluationResult,
  type FrontendAgentEvaluatorResult,
  validateContractDocument,
} from "@frontend-agent-benchmark/contracts";
import {
  currentProcessOwner,
  EXECUTION_LEASE_NAME,
  type AgentOutcome,
  type AttemptLifecycleStatus,
  type AttemptRecord,
  type CreateProducerRecordInput,
  type ExecutionClassification,
  type LeaseOwner,
  type ProducerKind,
  type RunRecord,
  type RunStatus,
  type StateStore,
  type TerminationPhase,
} from "@frontend-agent-benchmark/state-store-sqlite";
import {
  BUDGET_EXHAUSTED_WALL_TIME,
  DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES,
  DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES,
  FakeWorkspaceRunner,
  resolveToolPolicy,
  ToolExecutor,
  type ToolMetrics,
  type WorkspaceRunner,
} from "@frontend-agent-benchmark/tool-router";

export interface PhaseContext {
  runId: string;
  attemptId: string;
  ordinal: number;
  seed: number;
}

export type AgentPhaseOutcome =
  | {
      agentOutcome: "completed";
      patch: string;
      events?: string;
      stderr?: string;
      efficiency?: ToolMetrics;
    }
  | {
      agentOutcome: Exclude<AgentOutcome, "not_started" | "completed">;
      patch: string;
      failureCode: string;
      boundedSummary: string;
      events?: string;
      stderr?: string;
      efficiency?: ToolMetrics;
    };

export interface AgentPhase {
  run(context: PhaseContext): Promise<AgentPhaseOutcome>;
}

export interface EvaluationPhaseContext extends PhaseContext {
  agentOutcome: Exclude<AgentOutcome, "not_started">;
}

export interface EvaluationPhase {
  run(context: EvaluationPhaseContext): Promise<FrontendAgentEvaluatorResult>;
}

export interface SandboxStartingPhase {
  run(context: PhaseContext): Promise<void>;
}

export interface SandboxRuntime {
  start(context: PhaseContext): Promise<void>;
  capturePatch(context: PhaseContext): Promise<string>;
  cleanup(context: PhaseContext): Promise<void>;
  snapshot?(context: PhaseContext, destination: string): Promise<string>;
  freeze?(context: PhaseContext): Promise<string>;
  agentNetworkId?(context: PhaseContext): string | undefined;
}

export type CommittedTransition =
  | {
      scope: "run";
      id: string;
      fromState: RunStatus;
      toState: RunStatus;
    }
  | {
      scope: "attempt";
      id: string;
      fromState: AttemptLifecycleStatus;
      toState: AttemptLifecycleStatus;
    };

export class RunCoordinatorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunCoordinatorError";
  }
}

export class NoopAgent implements AgentPhase {
  async run(): Promise<AgentPhaseOutcome> {
    return { agentOutcome: "completed", patch: "" };
  }
}

export class SubprocessAgentPhase implements AgentPhase {
  constructor(private readonly options: {
    store: StateStore;
    command: AdapterCommand;
    maxFrameBytes: number;
    heartbeatTimeoutMs: number;
    cancelGraceMs?: number;
    artifacts?: ArtifactStoreFs;
    runner?: WorkspaceRunner;
    toolRouter?: {
      maxToolCalls?: number;
      maxTotalToolOutputBytes?: number;
      maxWallTimeMs?: number;
      outputCapBytes?: number;
      now?: () => number;
      startedAtMs?: number;
      isClosed?: () => boolean;
    };
    toolHandler?: (frame: AdapterFrame) => Promise<RoutedToolResponse | Record<string, unknown>>
      | RoutedToolResponse
      | Record<string, unknown>;
  }) {}

  async run(context: PhaseContext): Promise<AgentPhaseOutcome> {
    const run = this.options.store.runs.find(context.runId);
    if (!run) throw new RunCoordinatorError("RUN_NOT_FOUND", `Run ${context.runId} was not found`);
    const resolved = JSON.parse(run.resolvedInputJson) as {
      budgets?: { maxWallTimeSeconds?: number; maxAgentSteps?: number };
      permissions?: { writablePaths?: string[]; forbiddenPaths?: string[] };
      toolRouter?: {
        maxTotalToolOutputBytes?: number;
        maxInlineToolOutputBytes?: number;
      };
    };
    const artifacts = this.options.artifacts ?? new ArtifactStoreFs({
      runsRoot: dirname(this.options.store.databasePath),
      store: this.options.store,
    });
    const maxWallTimeMs = this.options.toolRouter?.maxWallTimeMs
      ?? (resolved.budgets?.maxWallTimeSeconds ?? 1) * 1_000;
    const executor = this.options.toolHandler ? undefined : new ToolExecutor({
      policy: resolveToolPolicy({
        writablePaths: resolved.permissions?.writablePaths ?? [],
        forbiddenPaths: resolved.permissions?.forbiddenPaths ?? [],
      }),
      budgets: {
        maxToolCalls: this.options.toolRouter?.maxToolCalls
          ?? resolved.budgets?.maxAgentSteps
          ?? 1,
        maxTotalToolOutputBytes: this.options.toolRouter?.maxTotalToolOutputBytes
          ?? resolved.toolRouter?.maxTotalToolOutputBytes
          ?? DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES,
        maxWallTimeMs,
      },
      outputCapBytes: this.options.toolRouter?.outputCapBytes
        ?? resolved.toolRouter?.maxInlineToolOutputBytes
        ?? DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES,
      runner: this.options.runner ?? new FakeWorkspaceRunner(),
      recorder: this.options.store.toolCalls,
      artifactWriter: {
        stage: ({ seq, content }) => {
          const relativePath = `tool-output/${seq}.txt`;
          artifacts.stage({
            runId: context.runId,
            attemptId: context.attemptId,
            ordinal: context.ordinal,
            logicalType: "tool_output",
            mime: "text/plain",
            relativePath,
            audience: "maintainer_only",
            producerRef: `attempt:${context.attemptId}:tool:${seq}`,
            content,
          });
          return relativePath;
        },
      },
      ...(this.options.toolRouter?.now ? { now: this.options.toolRouter.now } : {}),
      ...(this.options.toolRouter?.startedAtMs !== undefined
        ? { startedAtMs: this.options.toolRouter.startedAtMs }
        : {}),
      ...(this.options.toolRouter?.isClosed ? { isClosed: this.options.toolRouter.isClosed } : {}),
    });
    const host = new SubprocessAdapterHost({
      command: this.options.command,
      frameStore: this.options.store.adapterFrames,
      maxFrameBytes: this.options.maxFrameBytes,
      heartbeatTimeoutMs: this.options.heartbeatTimeoutMs,
      cancelGraceMs: this.options.cancelGraceMs,
      ...(executor ? {
        wallTimeBudgetMs: maxWallTimeMs,
        wallTimeBudgetUpdate: () => executor.budgetUpdate(BUDGET_EXHAUSTED_WALL_TIME),
      } : {}),
      toolHandler: this.options.toolHandler ?? (async (frame) => {
        const payload = frame.payload as {
          tool: string;
          arguments: Record<string, unknown>;
        };
        return executor!.execute({
          attemptId: context.attemptId,
          seq: frame.seq,
          tool: payload.tool,
          arguments: payload.arguments,
        });
      }),
    });
    try {
      const result = await host.run({
        runId: context.runId,
        attemptId: context.attemptId,
        taskId: run.taskId,
        taskVersion: run.taskVersion,
        seed: context.seed,
      });
      return {
        agentOutcome: "completed",
        patch: result.patch,
        events: result.eventFrames.map((frame) => JSON.stringify(frame)).join("\n") + "\n",
        stderr: result.stderr,
        efficiency: executor?.metrics(),
      };
    } catch (error) {
      if (!(error instanceof AdapterHostError)) throw error;
      return {
        agentOutcome: error.code.startsWith("BUDGET_EXHAUSTED_")
          ? "budget_exhausted"
          : error.code === "AGENT_CANCELLED"
          ? "cancelled"
          : error.code.startsWith("MODEL_") ? "model_error" : "adapter_error",
        patch: "",
        failureCode: error.code,
        boundedSummary: error.message.slice(0, 500),
        events: error.eventFrames.map((frame) => JSON.stringify(frame)).join("\n")
          + (error.eventFrames.length > 0 ? "\n" : ""),
        stderr: error.stderr,
        efficiency: executor?.metrics(),
      };
    }
  }
}

export class FailingAgent implements AgentPhase {
  async run(): Promise<AgentPhaseOutcome> {
    return {
      agentOutcome: "adapter_error",
      patch: "",
      failureCode: "ADAPTER_ERROR",
      boundedSummary: "Agent adapter failed",
    };
  }
}

export class BudgetExhaustedAgent implements AgentPhase {
  async run(): Promise<AgentPhaseOutcome> {
    return {
      agentOutcome: "budget_exhausted",
      patch: "",
      failureCode: "BUDGET_EXHAUSTED",
      boundedSummary: "Agent budget was exhausted",
    };
  }
}

export class CancelledAgent implements AgentPhase {
  async run(): Promise<AgentPhaseOutcome> {
    return {
      agentOutcome: "cancelled",
      patch: "",
      failureCode: "AGENT_CANCELLED",
      boundedSummary: "Agent execution was cancelled",
    };
  }
}

export class NoopEvaluator implements EvaluationPhase {
  async run(context: EvaluationPhaseContext): Promise<FrontendAgentEvaluatorResult> {
    const producerId = `${context.attemptId}:noop-evaluator`;
    const result: FrontendAgentEvaluatorResult = {
      schemaVersion: 1,
      evaluatorResultId: `${context.attemptId}:noop-result`,
      evaluatorId: "noop-evaluator",
      evaluatorVersion: "1",
      attemptId: context.attemptId,
      stage: "noop",
      deterministic: true,
      status: "passed",
      evaluatedSnapshotDigest: `noop:${context.attemptId}`,
      outcome: {
        passed: true,
        privateCode: "NOOP_EVALUATION_PASSED",
        summary: "No-op evaluation passed",
        score: 1,
      },
      producerRef: producerId,
      evidenceRefs: [`noop:${context.attemptId}:empty-patch`],
    };
    if (!validateContractDocument(result, "evaluator-result").valid) {
      throw new RunCoordinatorError("EVALUATOR_RESULT_INVALID", "No-op evaluator result is invalid");
    }
    return result;
  }
}

export class CrashingEvaluator implements EvaluationPhase {
  async run(): Promise<FrontendAgentEvaluatorResult> {
    throw new RunCoordinatorError("EVALUATOR_CRASH", "Evaluator crashed");
  }
}

export class InfrastructureFailure implements SandboxStartingPhase {
  async run(): Promise<void> {
    throw new RunCoordinatorError("SANDBOX_START_FAILED", "Sandbox failed to start");
  }
}

export interface RunExecutorOptions {
  store: StateStore;
  artifacts?: ArtifactStoreFs;
  agent: AgentPhase;
  evaluator: EvaluationPhase;
  sandboxStarting?: SandboxStartingPhase;
  sandboxRuntime?: SandboxRuntime;
  leaseHeartbeatMs?: number;
  onTransitionCommitted?: (transition: CommittedTransition) => void | Promise<void>;
}

interface AttemptConclusion {
  executionClassification: ExecutionClassification;
  failureCode: string | null;
  terminationCause: string | null;
  terminationPhase: TerminationPhase | null;
}

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  CREATED: ["PREFLIGHT"],
  PREFLIGHT: ["ATTEMPT_ACTIVE", "FAILED"],
  ATTEMPT_ACTIVE: ["ATTEMPT_ACTIVE", "AGGREGATING"],
  AGGREGATING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

const ATTEMPT_TRANSITIONS: Record<AttemptLifecycleStatus, readonly AttemptLifecycleStatus[]> = {
  CREATED: ["SANDBOX_STARTING"],
  SANDBOX_STARTING: ["AGENT_RUNNING", "FAILED"],
  AGENT_RUNNING: ["AGENT_STOPPING", "FAILED"],
  AGENT_STOPPING: ["WORKSPACE_FROZEN", "FAILED"],
  WORKSPACE_FROZEN: ["EVALUATING", "FAILED"],
  EVALUATING: ["FINALIZING", "FAILED"],
  FINALIZING: ["SUCCEEDED", "FAILED"],
  FAILED: [],
  SUCCEEDED: [],
};

const RETRYABLE_INFRASTRUCTURE_CODES = new Set([
  "DEPENDENCY_PROXY_UNAVAILABLE",
  "SANDBOX_START_FAILED",
  "SANDBOX_CLEANUP_FAILED",
]);

function summary(error: unknown, fallback: string): string {
  const value = error instanceof Error ? error.message : fallback;
  return (value || fallback).slice(0, 500);
}

function failureCode(error: unknown, fallback: string): string {
  if (error instanceof RunCoordinatorError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return fallback;
}

function producer(
  attemptId: string,
  kind: ProducerKind,
  phase: string,
  privateCode: string,
  boundedSummary: string,
  artifactRefs: string[],
): CreateProducerRecordInput {
  return {
    producerId: `${attemptId}:${privateCode}`,
    attemptId,
    kind,
    phase,
    privateCode,
    boundedSummary,
    artifactRefs,
  };
}

export function proxyDiagnosticRecord(input: {
  attemptId: string;
  dependencyCacheSnapshotId: string;
  proxyConfigurationHash: string;
  observedAt?: string;
}) {
  const observedAt = input.observedAt ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    proxyDiagnosticId: `proxy-diagnostic:${input.attemptId}`,
    attemptId: input.attemptId,
    dependencyCacheSnapshotId: input.dependencyCacheSnapshotId,
    proxyConfigurationHash: input.proxyConfigurationHash,
    observedAt,
    observationWindow: { startedAt: observedAt, endedAt: observedAt },
    requestCorrelationHash: `sha256:${createHash("sha256").update(input.attemptId).digest("hex")}`,
    trustedObservation: "Coordinator probe could not reach the controlled package proxy before agent start",
    outcome: "unavailable",
  };
}

function agentConclusion(outcome: AgentPhaseOutcome): AttemptConclusion {
  if (outcome.agentOutcome === "completed") {
    return {
      executionClassification: "completed",
      failureCode: null,
      terminationCause: null,
      terminationPhase: null,
    };
  }
  return {
    executionClassification: outcome.agentOutcome === "budget_exhausted"
      ? "budget_exhausted"
      : "agent_failure",
    failureCode: outcome.failureCode,
    terminationCause: outcome.failureCode,
    terminationPhase: "agent",
  };
}

export class RunExecutor {
  private readonly store: StateStore;
  private readonly artifacts: ArtifactStoreFs;
  private readonly agent: AgentPhase;
  private readonly evaluator: EvaluationPhase;
  private readonly sandboxStarting: SandboxStartingPhase;
  private readonly sandboxRuntime?: SandboxRuntime;
  private readonly leaseHeartbeatMs: number;
  private leaseOwner?: LeaseOwner;
  private readonly onTransitionCommitted?: RunExecutorOptions["onTransitionCommitted"];
  private readonly attemptEfficiency = new Map<string, ToolMetrics>();

  constructor(options: RunExecutorOptions) {
    this.store = options.store;
    this.artifacts = options.artifacts ?? new ArtifactStoreFs({
      runsRoot: dirname(options.store.databasePath),
      store: options.store,
    });
    this.agent = options.agent;
    this.evaluator = options.evaluator;
    this.sandboxRuntime = options.sandboxRuntime;
    this.sandboxStarting = options.sandboxRuntime
      ? { run: (context) => options.sandboxRuntime!.start(context) }
      : options.sandboxStarting ?? { run: async () => {} };
    this.leaseHeartbeatMs = options.leaseHeartbeatMs ?? 1_000;
    this.onTransitionCommitted = options.onTransitionCommitted;
  }

  setAgentOutcome(
    attemptId: string,
    outcome: Exclude<AgentOutcome, "not_started">,
    record?: CreateProducerRecordInput,
  ): AttemptRecord {
    return this.store.attempts.setAgentOutcome(attemptId, outcome, record);
  }

  async execute(runId: string): Promise<RunRecord> {
    const owner = currentProcessOwner();
    this.store.leases.acquire(EXECUTION_LEASE_NAME, owner);
    this.leaseOwner = owner;
    let heartbeatFailure: unknown;
    const heartbeat = setInterval(() => {
      try {
        this.store.leases.heartbeat(EXECUTION_LEASE_NAME, owner);
      } catch (error) {
        heartbeatFailure = error;
      }
    }, this.leaseHeartbeatMs);
    heartbeat.unref();
    try {
      const result = await this.executeWithLease(runId);
      if (heartbeatFailure) throw heartbeatFailure;
      return result;
    } finally {
      clearInterval(heartbeat);
      this.store.leases.release(EXECUTION_LEASE_NAME, owner);
      this.leaseOwner = undefined;
    }
  }

  private async executeWithLease(runId: string): Promise<RunRecord> {
    const run = this.store.runs.find(runId);
    if (!run || run.status !== "PREFLIGHT") {
      throw new RunCoordinatorError(
        "ILLEGAL_RUN_TRANSITION",
        `Run ${runId} cannot start from ${run?.status ?? "missing"}`,
      );
    }

    await this.transitionRun(runId, "ATTEMPT_ACTIVE", "Attempt execution started");
    const seed = run.seedSet[0]!;

    for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
      const attempt = this.store.attempts.create({
        attemptId: randomUUID(),
        runId,
        ordinal,
        seed,
        createdAt: new Date().toISOString(),
      });
      const result = await this.executeAttempt(attempt);
      const retry = result.executionClassification === "infrastructure_error"
        && ordinal === 1
        && result.failureCode !== null
        && RETRYABLE_INFRASTRUCTURE_CODES.has(result.failureCode);
      if (retry) {
        await this.transitionRun(
          runId,
          "ATTEMPT_ACTIVE",
          `Retrying after ${result.failureCode}`,
        );
        continue;
      }

      await this.transitionRun(runId, "AGGREGATING", "Attempt reached a terminal result");
      const failed = result.executionClassification === "infrastructure_error"
        || result.executionClassification === "evaluator_error";
      if (!failed) {
        this.finalizeResult(run, result);
      }
      return this.transitionRun(
        runId,
        failed ? "FAILED" : "COMPLETED",
        failed ? "Execution could not produce a quality result" : "Aggregation completed",
        new Date().toISOString(),
      );
    }

    throw new RunCoordinatorError("ATTEMPT_ORDINAL_LIMIT", "Only two Attempts are permitted");
  }

  private finalizeResult(run: RunRecord, attempt: AttemptRecord): void {
    const solved = attempt.executionClassification === "completed";
    const efficiency = this.attemptEfficiency.get(attempt.attemptId);
    const evidenceRefs = [`attempts/${attempt.ordinal}/evaluator-results/noop.json`];
    const score = { value: solved ? 1 : 0, evidenceRefs };
    const result: FrontendAgentEvaluationResult = {
      schemaVersion: 1,
      runId: run.runId,
      attemptId: attempt.attemptId,
      evaluatedSnapshotDigest: `noop:${attempt.attemptId}`,
      task: { id: run.taskId, version: run.taskVersion },
      valid: true,
      solved,
      evidenceRefs: { valid: evidenceRefs, solved: evidenceRefs },
      scores: {
        build: score,
        functional: score,
        visual: score,
        responsive: score,
        accessibility: score,
        engineering: score,
      },
      efficiency: {
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: efficiency?.toolCalls ?? 0,
        toolOutputBytes: efficiency?.totalToolOutputBytes ?? 0,
        wallTimeSeconds: efficiency?.wallTimeSeconds ?? 0,
        costUsd: 0,
      },
      extensions: { executionClassification: attempt.executionClassification },
    };
    if (!validateContractDocument(result, "result").valid) {
      throw new RunCoordinatorError("RESULT_INVALID", "Canonical Result is invalid");
    }
    const resultJson = JSON.stringify(result);
    const resultChecksum = `sha256:${createHash("sha256").update(resultJson).digest("hex")}`;
    this.store.results.create({
      runId: run.runId,
      resultJson,
      resultChecksum,
      createdAt: new Date().toISOString(),
    });
    this.artifacts.writeDerivedResult(run.runId, resultJson, resultChecksum);
  }

  private async executeAttempt(attempt: AttemptRecord): Promise<AttemptRecord> {
    const context: PhaseContext = {
      runId: attempt.runId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
      seed: attempt.seed,
    };

    await this.transitionAttempt(attempt.attemptId, "SANDBOX_STARTING", "Sandbox startup began");
    try {
      await this.sandboxStarting.run(context);
      const networkId = this.sandboxRuntime?.agentNetworkId?.(context);
      if (networkId) {
        this.store.attempts.setAgentNetworkId(attempt.attemptId, networkId);
        const resolved = JSON.parse(this.store.runs.find(attempt.runId)!.resolvedInputJson) as {
          networkPolicyId?: string;
          services?: { mockApi?: { port: number }; packageProxy?: { port: number } };
        };
        const policy = {
          schemaVersion: 1,
          networkPolicyId: resolved.networkPolicyId ?? `network-policy:${attempt.attemptId}`,
          version: 1,
          phase: "agent",
          defaultAction: "deny",
          allowedDestinations: [
            ...(resolved.services?.mockApi ? [{ destinationId: "mock-api", kind: "mock_api", alias: "mock-api", port: resolved.services.mockApi.port }] : []),
            ...(resolved.services?.packageProxy ? [{ destinationId: "package-proxy", kind: "package_proxy", alias: "package-proxy", port: resolved.services.packageProxy.port }] : []),
          ],
          violationCode: "NETWORK_POLICY_VIOLATION",
          extensions: { agentNetworkId: networkId, deniedCategories: ["host_gateway", "loopback", "lan", "public_dns", "internet"] },
        };
        if (!validateContractDocument(policy, "network-policy").valid) {
          throw new RunCoordinatorError("NETWORK_POLICY_INVALID", "Resolved network policy is invalid");
        }
        this.artifacts.stage({
          runId: attempt.runId, attemptId: attempt.attemptId, ordinal: attempt.ordinal,
          logicalType: "network_policy", mime: "application/json", relativePath: "network-policy.json",
          audience: "maintainer_only", producerRef: `attempt:${attempt.attemptId}:network-policy`, content: JSON.stringify(policy),
        });
      }
    } catch (error) {
      let finalError = error;
      if (this.sandboxRuntime) {
        try {
          await this.sandboxRuntime.cleanup(context);
        } catch (cleanupError) {
          finalError = cleanupError;
        }
      }
      const code = failureCode(finalError, "SANDBOX_START_FAILED");
      const resolved = JSON.parse(this.store.runs.find(attempt.runId)!.resolvedInputJson) as {
        dependencyCacheSnapshotId?: string;
        proxyConfigurationHash?: string;
      };
      const diagnostic = code === "DEPENDENCY_PROXY_UNAVAILABLE"
        && resolved.dependencyCacheSnapshotId && resolved.proxyConfigurationHash
        ? proxyDiagnosticRecord({
            attemptId: attempt.attemptId,
            dependencyCacheSnapshotId: resolved.dependencyCacheSnapshotId,
            proxyConfigurationHash: resolved.proxyConfigurationHash,
          })
        : undefined;
      if (diagnostic) {
        if (!validateContractDocument(diagnostic, "proxy-diagnostic-record").valid) {
          throw new RunCoordinatorError("PROXY_DIAGNOSTIC_INVALID", "Proxy diagnostic record is invalid");
        }
        this.artifacts.stage({
          runId: attempt.runId, attemptId: attempt.attemptId, ordinal: attempt.ordinal,
          logicalType: "proxy_diagnostic", mime: "application/json", relativePath: "proxy-diagnostic.json",
          audience: "maintainer_only", producerRef: `attempt:${attempt.attemptId}:dependency-proxy`,
          content: JSON.stringify(diagnostic),
        });
      }
      const failed = await this.transitionAttempt(
        attempt.attemptId,
        "FAILED",
        code,
        {
          executionClassification: "infrastructure_error",
          terminationCause: code,
          terminationPhase: "sandbox_starting",
          failureCode: code,
        },
        producer(
          attempt.attemptId,
          "infrastructure",
          "sandbox_starting",
          code,
          summary(finalError, "Sandbox failed to start"),
          diagnostic ? ["proxy-diagnostic.json"] : [`attempt:${attempt.attemptId}:sandbox-starting`],
        ),
      );
      if (diagnostic) this.artifacts.finalize(attempt.runId, attempt.attemptId, attempt.ordinal);
      return failed;
    }

    await this.transitionAttempt(attempt.attemptId, "AGENT_RUNNING", "Agent phase began");
    let agentOutcome: AgentPhaseOutcome;
    try {
      agentOutcome = await this.agent.run(context);
    } catch (error) {
      agentOutcome = {
        agentOutcome: "adapter_error",
        patch: "",
        failureCode: "ADAPTER_ERROR",
        boundedSummary: summary(error, "Agent adapter failed"),
      };
    }
    if (agentOutcome.efficiency) {
      this.attemptEfficiency.set(attempt.attemptId, agentOutcome.efficiency);
    }

    const agentRecord = agentOutcome.agentOutcome === "completed"
      ? undefined
      : producer(
          attempt.attemptId,
          agentOutcome.agentOutcome === "budget_exhausted" ? "budget" : "adapter",
          "agent",
          agentOutcome.failureCode,
          agentOutcome.boundedSummary,
          [`attempt:${attempt.attemptId}:agent-outcome`],
        );
    this.setAgentOutcome(attempt.attemptId, agentOutcome.agentOutcome, agentRecord);
    this.artifacts.stage({
      runId: attempt.runId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
      logicalType: "agent_events",
      mime: "application/x-ndjson",
      relativePath: "agent-events.jsonl",
      audience: "requester_safe",
      producerRef: `attempt:${attempt.attemptId}:agent`,
      content: agentOutcome.events ?? `${JSON.stringify({
        event: "agent_completed",
        attemptId: attempt.attemptId,
        agentOutcome: agentOutcome.agentOutcome,
      })}\n`,
    });
    if (agentOutcome.stderr !== undefined) {
      this.artifacts.stage({
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        logicalType: "adapter_stderr",
        mime: "text/plain",
        relativePath: "adapter.stderr.log",
        audience: "maintainer_only",
        producerRef: `attempt:${attempt.attemptId}:agent`,
        content: agentOutcome.stderr,
      });
    }
    const conclusion = agentConclusion(agentOutcome);

    await this.transitionAttempt(attempt.attemptId, "AGENT_STOPPING", "Agent phase ended");
    let patch = agentOutcome.patch;
    let sandboxError: unknown;
    if (this.sandboxRuntime) {
      try {
        const census = await this.sandboxRuntime.freeze?.(context);
        if (census) this.artifacts.stage({
          runId: attempt.runId, attemptId: attempt.attemptId, ordinal: attempt.ordinal,
          logicalType: "process_census", mime: "application/json", relativePath: "process-census.json",
          audience: "maintainer_only", producerRef: `attempt:${attempt.attemptId}:phase-barrier`, content: census,
        });
        patch = await this.sandboxRuntime.capturePatch(context);
        if (this.sandboxRuntime.snapshot) {
          const digest = await this.sandboxRuntime.snapshot(
            context,
            join(this.artifacts.attemptStagingDirectory(attempt.runId, attempt.attemptId), "snapshot"),
          );
          this.store.attempts.setSubmissionSnapshotDigest(attempt.attemptId, digest);
        }
      } catch (error) {
        sandboxError = error;
      }
      try {
        await this.sandboxRuntime.cleanup(context);
      } catch (error) {
        sandboxError = error;
      }
    }
    if (sandboxError) {
      const code = failureCode(sandboxError, "SANDBOX_CLEANUP_FAILED");
      return this.transitionAttempt(
        attempt.attemptId,
        "FAILED",
        code,
        {
          executionClassification: code === "SNAPSHOT_UNSAFE_ENTRY" || code === "SANDBOX_RESIDUAL_PROCESSES" ? "invalid" : "infrastructure_error",
          terminationCause: code,
          terminationPhase: "agent",
          failureCode: code,
        },
        producer(
          attempt.attemptId,
          "infrastructure",
          "agent",
          code,
          summary(sandboxError, "Sandbox freeze or cleanup failed"),
          [`attempt:${attempt.attemptId}:sandbox-cleanup`],
        ),
      );
    }
    if (patch) {
      this.artifacts.stage({
        runId: attempt.runId,
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        logicalType: "patch",
        mime: "text/x-diff",
        relativePath: "patch.diff",
        audience: "requester_safe",
        producerRef: `attempt:${attempt.attemptId}:agent`,
        content: patch,
      });
    }
    await this.transitionAttempt(attempt.attemptId, "WORKSPACE_FROZEN", "Workspace freeze completed");
    await this.transitionAttempt(attempt.attemptId, "EVALUATING", "Evaluation began");

    let evaluationResult: FrontendAgentEvaluatorResult;
    try {
      evaluationResult = await this.evaluator.run({
        ...context,
        agentOutcome: agentOutcome.agentOutcome,
      });
      const validation = validateContractDocument(evaluationResult, "evaluator-result");
      if (!validation.valid || evaluationResult.attemptId !== attempt.attemptId) {
        throw new RunCoordinatorError(
          "EVALUATOR_RESULT_INVALID",
          "Evaluator returned an invalid or mismatched result",
        );
      }
    } catch (error) {
      const code = failureCode(error, "EVALUATOR_CRASH");
      return this.transitionAttempt(
        attempt.attemptId,
        "FAILED",
        code,
        {
          executionClassification: "evaluator_error",
          terminationCause: code,
          terminationPhase: "evaluation",
          failureCode: code,
        },
        producer(
          attempt.attemptId,
          "evaluator",
          "evaluation",
          code,
          summary(error, "Evaluator crashed"),
          [`attempt:${attempt.attemptId}:evaluation`],
        ),
      );
    }

    this.artifacts.stage({
      runId: attempt.runId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
      logicalType: "evaluator_result",
      mime: "application/json",
      relativePath: "evaluator-results/noop.json",
      audience: "maintainer_only",
      producerRef: evaluationResult.producerRef,
      content: JSON.stringify(evaluationResult),
    });

    await this.transitionAttempt(
      attempt.attemptId,
      "FINALIZING",
      "Evaluation completed",
      undefined,
      {
        producerId: evaluationResult.producerRef,
        attemptId: attempt.attemptId,
        kind: "evaluator",
        phase: "evaluation",
        privateCode: evaluationResult.outcome.privateCode,
        boundedSummary: evaluationResult.outcome.summary ?? "Evaluator completed",
        artifactRefs: ["evaluator-results/noop.json"],
      },
    );

    this.artifacts.finalize(attempt.runId, attempt.attemptId, attempt.ordinal);

    return this.transitionAttempt(
      attempt.attemptId,
      "SUCCEEDED",
      "Attempt finalized",
      conclusion,
    );
  }

  private async transitionRun(
    runId: string,
    toState: RunStatus,
    reason: string,
    finishedAt?: string,
  ): Promise<RunRecord> {
    this.assertLease();
    const run = this.store.runs.find(runId);
    if (!run || !RUN_TRANSITIONS[run.status].includes(toState)) {
      throw new RunCoordinatorError(
        "ILLEGAL_RUN_TRANSITION",
        `Run ${runId} cannot transition from ${run?.status ?? "missing"} to ${toState}`,
      );
    }
    const changed = this.store.runs.transition({
      runId,
      fromState: run.status,
      toState,
      reason,
      at: new Date().toISOString(),
      ...(finishedAt ? { finishedAt } : {}),
    });
    await this.onTransitionCommitted?.({
      scope: "run",
      id: runId,
      fromState: run.status,
      toState,
    });
    return changed;
  }

  private async transitionAttempt(
    attemptId: string,
    toState: AttemptLifecycleStatus,
    reason: string,
    conclusion?: AttemptConclusion,
    record?: CreateProducerRecordInput,
  ): Promise<AttemptRecord> {
    this.assertLease();
    const attempt = this.store.attempts.find(attemptId);
    if (!attempt || !ATTEMPT_TRANSITIONS[attempt.lifecycleStatus].includes(toState)) {
      throw new RunCoordinatorError(
        "ILLEGAL_ATTEMPT_TRANSITION",
        `Attempt ${attemptId} cannot transition from ${attempt?.lifecycleStatus ?? "missing"} to ${toState}`,
      );
    }
    const changed = this.store.attempts.transition({
      attemptId,
      fromState: attempt.lifecycleStatus,
      toState,
      reason,
      at: new Date().toISOString(),
      ...(conclusion ? {
        terminal: {
          ...conclusion,
          finishedAt: new Date().toISOString(),
        },
      } : {}),
      ...(record ? { producer: record } : {}),
    });
    await this.onTransitionCommitted?.({
      scope: "attempt",
      id: attemptId,
      fromState: attempt.lifecycleStatus,
      toState,
    });
    return changed;
  }

  private assertLease(): void {
    if (this.leaseOwner) {
      this.store.leases.heartbeat(EXECUTION_LEASE_NAME, this.leaseOwner);
    }
  }
}

import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import { redactCredentials, redactCredentialValues } from "@frontend-agent-benchmark/contracts";

export const TOOL_POLICY_DENIED = "TOOL_POLICY_DENIED";
export const TOOL_ENV_OVERRIDE_DENIED = "TOOL_ENV_OVERRIDE_DENIED";
export const TOOL_ROUTER_CLOSED = "TOOL_ROUTER_CLOSED";
export const BUDGET_EXHAUSTED_TOOL_CALLS = "BUDGET_EXHAUSTED_TOOL_CALLS";
export const BUDGET_EXHAUSTED_OUTPUT = "BUDGET_EXHAUSTED_OUTPUT";
export const BUDGET_EXHAUSTED_WALL_TIME = "BUDGET_EXHAUSTED_WALL_TIME";
export const DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES = 1_048_576;
export const DEFAULT_MAX_INLINE_TOOL_OUTPUT_BYTES = 4_096;

export type AllowedTool = "echo" | "read_file" | "write_file" | "run_command";
export type ToolBudgetCode =
  | typeof BUDGET_EXHAUSTED_TOOL_CALLS
  | typeof BUDGET_EXHAUSTED_OUTPUT
  | typeof BUDGET_EXHAUSTED_WALL_TIME;

export interface ToolPolicy {
  allowedTools: ReadonlySet<string>;
  readablePaths: string[];
  writablePaths: string[];
  forbiddenPaths: string[];
}

export interface ToolBudgets {
  maxToolCalls: number;
  maxTotalToolOutputBytes: number;
  maxWallTimeMs: number;
}

export interface ToolMetrics {
  toolCalls: number;
  totalToolOutputBytes: number;
  wallTimeSeconds: number;
}

export interface ToolExecutionInput {
  attemptId: string;
  seq: number;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AcceptedToolCall {
  attemptId: string;
  seq: number;
  tool: string;
  argumentsJson: string;
  acceptedAt: string;
}

export interface CompletedToolCall {
  attemptId: string;
  seq: number;
  outcomeCode: string;
  outputBytes: number;
  truncated: boolean;
  artifactRef: string | null;
  executedAt: string;
}

export interface ToolCallRecorder {
  accept(record: AcceptedToolCall): unknown;
  complete(record: CompletedToolCall): unknown;
}

export interface ToolArtifactWriter {
  stage(input: { seq: number; content: string }): string;
}

export interface WorkspaceRunner {
  run(tool: AllowedTool, arguments_: Record<string, unknown>): Promise<string> | string;
}

export type ToolExecutionResult =
  | {
      kind: "tool_result";
      status: "succeeded" | "failed" | "rejected";
      output?: Record<string, unknown>;
      errorCode?: string;
    }
  | {
      kind: "budget_exhausted";
      code: ToolBudgetCode;
      remaining: {
        wallTimeSeconds: number;
        steps: number;
        costUsd: number;
      };
      extensions: {
        code: ToolBudgetCode;
        totalToolOutputBytes: number;
        remainingToolOutputBytes: number;
      };
    };

const DEFAULT_TOOLS: AllowedTool[] = ["echo", "read_file", "write_file", "run_command"];
const FORBIDDEN_ENV = /^(?:https?_?proxy|all_?proxy|no_?proxy|npm_config_(?:proxy|https_proxy)|dns|dns_?server|res_?options|network|network_?mode)$/i;

function normalizePrefix(value: string): string | undefined {
  const withoutGlob = value.replace(/\/\*\*?$/, "");
  return normalizePath(withoutGlob);
}

function normalizePath(value: string): string | undefined {
  if (!value || value.includes("\0") || value.includes("\\")
    || isAbsolute(value) || win32.isAbsolute(value)) return undefined;
  const normalized = posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized;
}

function within(candidate: string, prefix: string): boolean {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

function pathAllowed(value: unknown, allowed: string[], forbidden: string[]): boolean {
  if (typeof value !== "string") return false;
  const candidate = normalizePath(value);
  if (!candidate) return false;
  return allowed.some((prefix) => within(candidate, prefix))
    && !forbidden.some((prefix) => within(candidate, prefix));
}

function argumentsJson(arguments_: Record<string, unknown>): string {
  const redacted = JSON.stringify(redactCredentialValues(arguments_));
  if (Buffer.byteLength(redacted) <= 4_096) return redacted;
  const hash = createHash("sha256").update(redacted).digest("hex");
  return JSON.stringify({ sha256: `sha256:${hash}`, bytes: Buffer.byteLength(redacted) });
}

function hasForbiddenEnvOverride(arguments_: Record<string, unknown>): boolean {
  const inspect = (value: unknown, overrideScope: boolean): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.entries(value).some(([key, child]) => {
      const scoped = overrideScope || /^(?:env|environment|config)$/i.test(key);
      return (scoped && FORBIDDEN_ENV.test(key)) || inspect(child, scoped);
    });
  };
  return Object.keys(arguments_).some((key) => FORBIDDEN_ENV.test(key))
    || inspect(arguments_, false);
}

export function resolveToolPolicy(input: {
  writablePaths: string[];
  forbiddenPaths?: string[];
  allowedTools?: string[];
}): ToolPolicy {
  const writablePaths = input.writablePaths.flatMap((value) => {
    const normalized = normalizePrefix(value);
    return normalized ? [normalized] : [];
  });
  const forbiddenPaths = (input.forbiddenPaths ?? []).flatMap((value) => {
    const normalized = normalizePrefix(value);
    return normalized ? [normalized] : [];
  });
  return {
    allowedTools: new Set(input.allowedTools ?? DEFAULT_TOOLS),
    readablePaths: writablePaths,
    writablePaths,
    forbiddenPaths,
  };
}

export class FakeWorkspaceRunner implements WorkspaceRunner {
  private readonly files = new Map<string, string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) this.files.set(path, content);
  }

  run(tool: AllowedTool, arguments_: Record<string, unknown>): string {
    if (tool === "echo") {
      if (typeof arguments_.message === "string") return arguments_.message;
      const count = typeof arguments_.count === "number" ? Math.max(0, Math.floor(arguments_.count)) : 0;
      const value = typeof arguments_.repeat === "string" ? arguments_.repeat : "";
      // ponytail: bound the fake seam; a real Sandbox runner owns streaming output limits later.
      return value.repeat(Math.min(count, DEFAULT_MAX_TOTAL_TOOL_OUTPUT_BYTES + 1));
    }
    if (tool === "read_file") {
      const path = String(arguments_.path ?? "");
      if (!this.files.has(path)) throw new Error(`File ${path} does not exist`);
      return this.files.get(path)!;
    }
    if (tool === "write_file") {
      const path = String(arguments_.path ?? "");
      const content = String(arguments_.content ?? "");
      this.files.set(path, content);
      return content;
    }
    const command = String(arguments_.command ?? "");
    if (command === "emit_fake_credential") return "api_key=" + "toolrouter" + "secret123456";
    if (command === "fail") throw new Error("Fake command failed");
    return `fake command: ${command}`;
  }
}

export class ToolExecutor {
  private toolCalls = 0;
  private outputBytes = 0;
  private readonly startedAtMs: number;

  constructor(private readonly options: {
    policy: ToolPolicy;
    budgets: ToolBudgets;
    outputCapBytes: number;
    runner: WorkspaceRunner;
    recorder: ToolCallRecorder;
    artifactWriter?: ToolArtifactWriter;
    isClosed?: () => boolean;
    now?: () => number;
    startedAtMs?: number;
  }) {
    this.startedAtMs = options.startedAtMs ?? this.now();
  }

  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const acceptedAt = new Date(this.now()).toISOString();
    this.options.recorder.accept({
      attemptId: input.attemptId,
      seq: input.seq,
      tool: input.tool,
      argumentsJson: argumentsJson(input.arguments),
      acceptedAt,
    });

    if (this.options.isClosed?.()) return this.finishResult(input, "rejected", TOOL_ROUTER_CLOSED, 0);
    const exhausted = this.exhaustedBeforeExecution();
    if (exhausted) return this.finishBudget(input, exhausted, 0);
    this.toolCalls += 1;
    if (hasForbiddenEnvOverride(input.arguments)) {
      return this.finishResult(input, "rejected", TOOL_ENV_OVERRIDE_DENIED, 0);
    }
    if (!this.options.policy.allowedTools.has(input.tool) || !this.allowedPath(input)) {
      return this.finishResult(input, "rejected", TOOL_POLICY_DENIED, 0);
    }
    let rawOutput: string;
    try {
      rawOutput = await this.options.runner.run(input.tool as AllowedTool, input.arguments);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Tool execution failed";
      const message = redactCredentials(rawMessage);
      const bytes = Buffer.byteLength(rawMessage);
      this.outputBytes += bytes;
      if (this.now() - this.startedAtMs >= this.options.budgets.maxWallTimeMs) {
        return this.finishBudget(input, BUDGET_EXHAUSTED_WALL_TIME, bytes);
      }
      if (this.outputBytes > this.options.budgets.maxTotalToolOutputBytes) {
        return this.finishBudget(input, BUDGET_EXHAUSTED_OUTPUT, bytes);
      }
      return this.finishResult(input, "failed", "TOOL_EXECUTION_FAILED", bytes, {
        text: message,
      });
    }
    const bytes = Buffer.byteLength(rawOutput);
    const output = redactCredentials(rawOutput);
    this.outputBytes += bytes;
    if (this.now() - this.startedAtMs >= this.options.budgets.maxWallTimeMs) {
      return this.finishBudget(input, BUDGET_EXHAUSTED_WALL_TIME, bytes);
    }
    if (this.outputBytes > this.options.budgets.maxTotalToolOutputBytes) {
      return this.finishBudget(input, BUDGET_EXHAUSTED_OUTPUT, bytes);
    }
    if (bytes > this.options.outputCapBytes) {
      if (!this.options.artifactWriter) throw new Error("Oversized output requires an Artifact writer");
      const artifactRef = this.options.artifactWriter.stage({ seq: input.seq, content: output });
      this.complete(input, "TOOL_SUCCEEDED", bytes, true, artifactRef);
      return {
        kind: "tool_result",
        status: "succeeded",
        output: {
          artifactRef,
          truncated: true,
          marker: `[TRUNCATED:${bytes} bytes; full output in maintainer_only artifact]`,
        },
      };
    }
    return this.finishResult(input, "succeeded", "TOOL_SUCCEEDED", bytes, { text: output });
  }

  metrics(): ToolMetrics {
    return {
      toolCalls: this.toolCalls,
      totalToolOutputBytes: this.outputBytes,
      wallTimeSeconds: Math.max(0, this.now() - this.startedAtMs) / 1_000,
    };
  }

  budgetUpdate(code: ToolBudgetCode): Omit<
    Extract<ToolExecutionResult, { kind: "budget_exhausted" }>,
    "kind" | "code"
  > {
    const metrics = this.metrics();
    return {
      remaining: {
        wallTimeSeconds: Math.max(0, this.options.budgets.maxWallTimeMs / 1_000 - metrics.wallTimeSeconds),
        steps: Math.max(0, this.options.budgets.maxToolCalls - metrics.toolCalls),
        costUsd: 0,
      },
      extensions: {
        code,
        totalToolOutputBytes: metrics.totalToolOutputBytes,
        remainingToolOutputBytes: Math.max(0, this.options.budgets.maxTotalToolOutputBytes - metrics.totalToolOutputBytes),
      },
    };
  }

  private allowedPath(input: ToolExecutionInput): boolean {
    if (input.tool === "read_file") {
      return pathAllowed(input.arguments.path, this.options.policy.readablePaths, this.options.policy.forbiddenPaths);
    }
    if (input.tool === "write_file") {
      return pathAllowed(input.arguments.path, this.options.policy.writablePaths, this.options.policy.forbiddenPaths);
    }
    if (input.tool === "run_command" && input.arguments.cwd !== undefined) {
      return pathAllowed(input.arguments.cwd, this.options.policy.writablePaths, this.options.policy.forbiddenPaths);
    }
    return true;
  }

  private exhaustedBeforeExecution(): ToolBudgetCode | undefined {
    if (this.toolCalls >= this.options.budgets.maxToolCalls) return BUDGET_EXHAUSTED_TOOL_CALLS;
    if (this.now() - this.startedAtMs >= this.options.budgets.maxWallTimeMs) {
      return BUDGET_EXHAUSTED_WALL_TIME;
    }
    if (this.outputBytes > this.options.budgets.maxTotalToolOutputBytes) {
      return BUDGET_EXHAUSTED_OUTPUT;
    }
    return undefined;
  }

  private finishResult(
    input: ToolExecutionInput,
    status: "succeeded" | "failed" | "rejected",
    code: string,
    bytes: number,
    output?: Record<string, unknown>,
  ): ToolExecutionResult {
    this.complete(input, code, bytes, false, null);
    return {
      kind: "tool_result",
      status,
      ...(output ? { output } : {}),
      ...(status === "succeeded" ? {} : { errorCode: code }),
    };
  }

  private finishBudget(input: ToolExecutionInput, code: ToolBudgetCode, bytes: number): ToolExecutionResult {
    this.complete(input, code, bytes, false, null);
    return {
      kind: "budget_exhausted",
      code,
      ...this.budgetUpdate(code),
    };
  }

  private complete(
    input: ToolExecutionInput,
    outcomeCode: string,
    outputBytes: number,
    truncated: boolean,
    artifactRef: string | null,
  ): void {
    this.options.recorder.complete({
      attemptId: input.attemptId,
      seq: input.seq,
      outcomeCode,
      outputBytes,
      truncated,
      artifactRef,
      executedAt: new Date(this.now()).toISOString(),
    });
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

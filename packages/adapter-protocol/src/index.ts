import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { TextDecoder } from "node:util";

import {
  redactCredentialValues,
  redactCredentials,
  type FrontendAgentAdapterProtocolFrame,
  validateContractDocument,
} from "@frontend-agent-benchmark/contracts";

export const ADAPTER_PROTOCOL_VERSION = 1;
export const DEFAULT_MAX_FRAME_BYTES = 65_536;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5_000;
export const DEFAULT_CANCEL_GRACE_MS = 100;
export const ADAPTER_HOST_ENV_ALLOWLIST = ["LANG", "LC_ALL", "TZ", "__CF_USER_TEXT_ENCODING"] as const;

export type ProtocolErrorCode =
  | "PROTOCOL_MALFORMED_FRAME"
  | "PROTOCOL_FRAME_TOO_LARGE"
  | "PROTOCOL_SEQ_GAP"
  | "PROTOCOL_HEARTBEAT_TIMEOUT"
  | "PROTOCOL_HANDSHAKE_FAILED"
  | "PROTOCOL_UNEXPECTED_FRAME";

export type AdapterFailureCode = ProtocolErrorCode | "ADAPTER_PROCESS_EXITED" | "AGENT_CANCELLED" | string;
export type FrameDirection = "adapter_to_coordinator" | "coordinator_to_adapter";
export type AdapterFrame = FrontendAgentAdapterProtocolFrame;

export interface PersistedFrame {
  attemptId: string;
  direction: FrameDirection;
  seq: number;
  type: string;
  frameJson: string;
  receivedAt: string;
}

export interface FrameStore {
  append(record: PersistedFrame): PersistedFrame;
}

export class AdapterProtocolError extends Error {
  constructor(public readonly code: AdapterFailureCode, message: string) {
    super(message);
    this.name = "AdapterProtocolError";
  }
}

export class AdapterHostError extends AdapterProtocolError {
  constructor(
    code: AdapterFailureCode,
    message: string,
    public readonly eventFrames: AdapterFrame[],
    public readonly stderr: string,
  ) {
    super(code, message);
    this.name = "AdapterHostError";
  }
}

function frameError(code: ProtocolErrorCode, message: string): never {
  throw new AdapterProtocolError(code, message);
}

function validateFrame(value: unknown): AdapterFrame {
  const validation = validateContractDocument(value, "adapter-protocol");
  if (!validation.valid) {
    frameError("PROTOCOL_MALFORMED_FRAME", validation.errors[0]?.message ?? "Invalid protocol frame");
  }
  return value as AdapterFrame;
}

export class FrameCodec {
  constructor(public readonly maxFrameBytes = DEFAULT_MAX_FRAME_BYTES) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new TypeError("maxFrameBytes must be a positive integer");
    }
  }

  serialize(frame: AdapterFrame): Buffer {
    validateFrame(frame);
    const bytes = Buffer.from(JSON.stringify(frame));
    if (bytes.length > this.maxFrameBytes) {
      frameError("PROTOCOL_FRAME_TOO_LARGE", `Protocol frame exceeds ${this.maxFrameBytes} bytes`);
    }
    return Buffer.concat([bytes, Buffer.from("\n")]);
  }

  parse(line: Uint8Array): AdapterFrame {
    if (line.byteLength > this.maxFrameBytes) {
      frameError("PROTOCOL_FRAME_TOO_LARGE", `Protocol frame exceeds ${this.maxFrameBytes} bytes`);
    }
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(line);
    } catch {
      frameError("PROTOCOL_MALFORMED_FRAME", "Protocol frame is not valid UTF-8");
    }
    try {
      return validateFrame(JSON.parse(source));
    } catch (error) {
      if (error instanceof AdapterProtocolError) throw error;
      frameError("PROTOCOL_MALFORMED_FRAME", "Protocol frame is not valid JSON");
    }
  }
}

export class FrameDecoder {
  private pending = Buffer.alloc(0);

  constructor(private readonly codec: FrameCodec) {}

  push(chunk: Uint8Array): AdapterFrame[] {
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    const frames: AdapterFrame[] = [];
    let newline = this.pending.indexOf(0x0a);
    while (newline !== -1) {
      let line = this.pending.subarray(0, newline);
      this.pending = this.pending.subarray(newline + 1);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      frames.push(this.codec.parse(line));
      newline = this.pending.indexOf(0x0a);
    }
    if (this.pending.length > this.codec.maxFrameBytes) {
      frameError(
        "PROTOCOL_FRAME_TOO_LARGE",
        `Protocol frame exceeds ${this.codec.maxFrameBytes} bytes`,
      );
    }
    return frames;
  }

  finish(): AdapterFrame[] {
    if (this.pending.length === 0) return [];
    const frame = this.codec.parse(this.pending);
    this.pending = Buffer.alloc(0);
    return [frame];
  }
}

export type SessionState = "awaiting_hello" | "awaiting_ready" | "active" | "terminal" | "closed";

export class CoordinatorSession {
  private inboundSeq = 0;
  private outboundSeq = 0;
  private outboundHandshakeStep = 0;
  state: SessionState = "awaiting_hello";

  constructor(
    private readonly runId: string,
    private readonly attemptId: string,
    private readonly frames: FrameStore,
    private readonly maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  ) {}

  acceptInbound(frame: AdapterFrame): "accepted" | "duplicate" {
    validateFrame(frame);
    if (frame.protocolVersion !== ADAPTER_PROTOCOL_VERSION) {
      frameError("PROTOCOL_HANDSHAKE_FAILED", `Unsupported protocol version ${frame.protocolVersion}`);
    }
    if (frame.runId !== this.runId || frame.attemptId !== this.attemptId) {
      frameError(
        this.state === "awaiting_hello" ? "PROTOCOL_HANDSHAKE_FAILED" : "PROTOCOL_UNEXPECTED_FRAME",
        "Protocol frame Run or Attempt does not match the active session",
      );
    }
    if (frame.seq < this.inboundSeq) return "duplicate";
    if (frame.seq > this.inboundSeq) {
      frameError("PROTOCOL_SEQ_GAP", `Expected Adapter seq ${this.inboundSeq}, received ${frame.seq}`);
    }

    if (this.state === "awaiting_hello" && frame.type !== "hello") {
      frameError("PROTOCOL_HANDSHAKE_FAILED", "Adapter session must begin with hello");
    }
    if (this.state === "awaiting_ready" && frame.type !== "ready") {
      frameError("PROTOCOL_HANDSHAKE_FAILED", "Adapter must send ready after task_context");
    }
    if (this.state === "active" && ![
      "event", "tool_request", "complete", "error", "heartbeat",
    ].includes(frame.type)) {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Unexpected active-session frame ${frame.type}`);
    }
    if (this.state === "terminal" || this.state === "closed") {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Unexpected terminal-session frame ${frame.type}`);
    }

    this.persist("adapter_to_coordinator", frame);
    this.inboundSeq += 1;
    if (frame.type === "hello") this.state = "awaiting_ready";
    if (frame.type === "ready") this.state = "active";
    if (frame.type === "complete" || frame.type === "error") this.state = "terminal";
    return "accepted";
  }

  outbound(type: AdapterFrame["type"], payload: Record<string, unknown>): AdapterFrame {
    if (!["hello_ack", "task_context", "tool_result", "cancel", "budget_update", "shutdown"]
      .includes(type)) {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Coordinator cannot send ${type}`);
    }
    if (["hello_ack", "task_context"].includes(type) && this.state !== "awaiting_ready") {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Cannot send ${type} while ${this.state}`);
    }
    if (type === "hello_ack" && this.outboundHandshakeStep !== 0) {
      frameError("PROTOCOL_UNEXPECTED_FRAME", "hello_ack is out of order");
    }
    if (type === "task_context" && this.outboundHandshakeStep !== 1) {
      frameError("PROTOCOL_UNEXPECTED_FRAME", "task_context must follow hello_ack");
    }
    if (["tool_result", "budget_update"].includes(type) && this.state !== "active") {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Cannot send ${type} while ${this.state}`);
    }
    if (type === "shutdown" && this.state !== "terminal") {
      frameError("PROTOCOL_UNEXPECTED_FRAME", `Cannot send shutdown while ${this.state}`);
    }
    if (type === "cancel" && this.state === "closed") {
      frameError("PROTOCOL_UNEXPECTED_FRAME", "Cannot cancel a closed session");
    }
    const frame = validateFrame({
      schemaVersion: 1,
      protocolVersion: ADAPTER_PROTOCOL_VERSION,
      runId: this.runId,
      attemptId: this.attemptId,
      seq: this.outboundSeq,
      type,
      timestamp: new Date().toISOString(),
      payload,
    });
    if (Buffer.byteLength(JSON.stringify(frame)) > this.maxFrameBytes) {
      frameError("PROTOCOL_FRAME_TOO_LARGE", `Protocol frame exceeds ${this.maxFrameBytes} bytes`);
    }
    this.persist("coordinator_to_adapter", frame);
    this.outboundSeq += 1;
    if (type === "hello_ack") this.outboundHandshakeStep = 1;
    if (type === "task_context") this.outboundHandshakeStep = 2;
    if (type === "shutdown") this.state = "closed";
    return frame;
  }

  private persist(direction: FrameDirection, frame: AdapterFrame): void {
    this.frames.append({
      attemptId: this.attemptId,
      direction,
      seq: frame.seq,
      type: frame.type,
      frameJson: JSON.stringify(frame),
      receivedAt: new Date().toISOString(),
    });
  }
}

export interface AdapterCommand {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface AdapterHostOptions {
  command: AdapterCommand;
  frameStore: FrameStore;
  maxFrameBytes?: number;
  heartbeatTimeoutMs?: number;
  cancelGraceMs?: number;
  wallTimeBudgetMs?: number;
  wallTimeBudgetUpdate?: () => {
    remaining: { wallTimeSeconds: number; steps: number; costUsd: number };
    extensions?: Record<string, unknown>;
  };
  toolHandler?: (frame: AdapterFrame) => Promise<RoutedToolResponse | Record<string, unknown>>
    | RoutedToolResponse
    | Record<string, unknown>;
}

export type RoutedToolResponse =
  | {
      kind: "tool_result";
      status: "succeeded" | "failed" | "rejected";
      output?: Record<string, unknown>;
      errorCode?: string;
    }
  | {
      kind: "budget_exhausted";
      code: string;
      remaining: { wallTimeSeconds: number; steps: number; costUsd: number };
      extensions?: Record<string, unknown>;
    };

export interface AdapterHostInput {
  runId: string;
  attemptId: string;
  taskId: string;
  taskVersion: number;
  seed: number;
  signal?: AbortSignal;
}

export interface AdapterHostResult {
  patch: string;
  eventFrames: AdapterFrame[];
  stderr: string;
}

export class SubprocessAdapterHost {
  private readonly codec: FrameCodec;
  private readonly heartbeatTimeoutMs: number;
  private readonly cancelGraceMs: number;

  constructor(private readonly options: AdapterHostOptions) {
    this.codec = new FrameCodec(options.maxFrameBytes);
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    if (!Number.isFinite(this.heartbeatTimeoutMs) || this.heartbeatTimeoutMs <= 0) {
      throw new TypeError("heartbeatTimeoutMs must be positive");
    }
    if (!Number.isFinite(this.cancelGraceMs) || this.cancelGraceMs < 0) {
      throw new TypeError("cancelGraceMs must not be negative");
    }
    if (options.wallTimeBudgetMs !== undefined
      && (!Number.isFinite(options.wallTimeBudgetMs) || options.wallTimeBudgetMs <= 0)) {
      throw new TypeError("wallTimeBudgetMs must be positive");
    }
  }

  run(input: AdapterHostInput): Promise<AdapterHostResult> {
    const inheritedEnv = Object.fromEntries(ADAPTER_HOST_ENV_ALLOWLIST.flatMap((key) => (
      process.env[key] === undefined ? [] : [[key, process.env[key]!]]
    )));
    const child = spawn(this.options.command.command, this.options.command.args ?? [], {
      cwd: this.options.command.cwd,
      env: {
        ...inheritedEnv,
        ...this.options.command.env,
        FAB_RUN_ID: input.runId,
        FAB_ATTEMPT_ID: input.attemptId,
      },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    const decoder = new FrameDecoder(this.codec);
    const session = new CoordinatorSession(
      input.runId,
      input.attemptId,
      this.options.frameStore,
      this.codec.maxFrameBytes,
    );
    const eventFrames: AdapterFrame[] = [];
    let stderr = "";
    let completed: AdapterHostResult | undefined;
    let failure: AdapterProtocolError | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let wallTimeBudget: NodeJS.Timeout | undefined;
    let killDeadline: NodeJS.Timeout | undefined;
    let processing = Promise.resolve();

    return new Promise((resolve, reject) => {
      const write = (frame: AdapterFrame): void => {
        if (child.stdin.writable) child.stdin.write(this.codec.serialize(frame));
      };
      const send = (type: AdapterFrame["type"], payload: Record<string, unknown>): void => {
        write(session.outbound(type, payload));
      };
      const clearHeartbeat = (): void => {
        if (heartbeat) clearTimeout(heartbeat);
        heartbeat = undefined;
      };
      const clearWallTimeBudget = (): void => {
        if (wallTimeBudget) clearTimeout(wallTimeBudget);
        wallTimeBudget = undefined;
      };
      const fail = (error: unknown): void => {
        if (failure) return;
        failure = error instanceof AdapterProtocolError
          ? error
          : new AdapterProtocolError("PROTOCOL_UNEXPECTED_FRAME", error instanceof Error ? error.message : "Adapter failed");
        clearHeartbeat();
        clearWallTimeBudget();
        try { send("cancel", { reason: failure.code }); } catch {}
        if (killDeadline) clearTimeout(killDeadline);
        killDeadline = setTimeout(() => child.kill("SIGKILL"), this.cancelGraceMs);
      };
      const armHeartbeat = (): void => {
        clearHeartbeat();
        heartbeat = setTimeout(() => fail(new AdapterProtocolError(
          session.state === "active" ? "PROTOCOL_HEARTBEAT_TIMEOUT" : "PROTOCOL_HANDSHAKE_FAILED",
          "Adapter heartbeat deadline expired",
        )), this.heartbeatTimeoutMs);
      };
      const armWallTimeBudget = (): void => {
        if (wallTimeBudget || this.options.wallTimeBudgetMs === undefined) return;
        wallTimeBudget = setTimeout(() => {
          try {
            const update = this.options.wallTimeBudgetUpdate?.() ?? {
              remaining: { wallTimeSeconds: 0, steps: 0, costUsd: 0 },
            };
            send("budget_update", {
              remaining: update.remaining,
              ...(update.extensions ? { extensions: update.extensions } : {}),
            });
          } catch {}
          fail(new AdapterProtocolError(
            "BUDGET_EXHAUSTED_WALL_TIME",
            "Agent wall-time budget was exhausted",
          ));
        }, this.options.wallTimeBudgetMs);
      };
      const handle = async (frame: AdapterFrame): Promise<void> => {
        if (failure) return;
        const safeFrame = redactCredentialValues(frame);
        const accepted = session.acceptInbound(safeFrame);
        if (accepted === "duplicate") return;
        armHeartbeat();
        if (["event", "tool_request", "complete", "error"].includes(safeFrame.type)) {
          eventFrames.push(safeFrame);
        }
        if (safeFrame.type === "hello") {
          send("hello_ack", { accepted: true });
          send("task_context", {
            taskId: input.taskId,
            taskVersion: input.taskVersion,
            extensions: { seed: input.seed },
          });
        } else if (safeFrame.type === "ready") {
          armWallTimeBudget();
        } else if (safeFrame.type === "tool_request") {
          const payload = safeFrame.payload as { toolCallId: string; arguments: Record<string, unknown> };
          const routed = await (this.options.toolHandler?.(safeFrame) ?? { echo: payload.arguments });
          if (failure) return;
          if ("kind" in routed && routed.kind === "budget_exhausted") {
            const budget = routed as Extract<RoutedToolResponse, { kind: "budget_exhausted" }>;
            send("budget_update", {
              remaining: budget.remaining,
              ...(budget.extensions ? { extensions: budget.extensions } : {}),
            });
            fail(new AdapterProtocolError(budget.code, `Tool budget exhausted: ${budget.code}`));
            return;
          }
          if ("kind" in routed && routed.kind === "tool_result") {
            const result = routed as Extract<RoutedToolResponse, { kind: "tool_result" }>;
            send("tool_result", {
              toolCallId: payload.toolCallId,
              status: result.status,
              ...(result.output ? { output: result.output } : {}),
              ...(result.errorCode ? { errorCode: result.errorCode } : {}),
            });
            return;
          }
          send("tool_result", { toolCallId: payload.toolCallId, status: "succeeded", output: routed });
        } else if (safeFrame.type === "complete") {
          clearHeartbeat();
          clearWallTimeBudget();
          const result = {
            patch: typeof safeFrame.payload.patch === "string" ? safeFrame.payload.patch : "",
            eventFrames,
            stderr: redactCredentials(stderr),
          };
          send("shutdown", { reason: "complete" });
          completed = result;
          killDeadline = setTimeout(() => child.kill("SIGKILL"), this.cancelGraceMs);
        } else if (safeFrame.type === "error") {
          const payload = safeFrame.payload as { code: string; message: string };
          fail(new AdapterProtocolError(payload.code, payload.message));
        }
      };
      const processFrames = (frames: AdapterFrame[]): void => {
        processing = processing.then(async () => {
          for (const frame of frames) await handle(frame);
        }).catch(fail);
      };

      armHeartbeat();
      child.stdout.on("data", (chunk: Buffer) => {
        try { processFrames(decoder.push(chunk)); } catch (error) { fail(error); }
      });
      child.stdout.on("end", () => {
        try { processFrames(decoder.finish()); } catch (error) { fail(error); }
      });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.stdin.on("error", () => {});
      child.on("error", fail);
      child.on("close", (code, signal) => {
        void processing.then(() => {
          clearHeartbeat();
          clearWallTimeBudget();
          if (killDeadline) clearTimeout(killDeadline);
          input.signal?.removeEventListener("abort", abort);
          const safeStderr = redactCredentials(stderr);
          if (failure) {
            reject(new AdapterHostError(failure.code, failure.message, eventFrames, safeStderr));
          } else if (completed) {
            resolve({ ...completed, stderr: safeStderr });
          } else {
            reject(new AdapterHostError(
              "ADAPTER_PROCESS_EXITED",
              `Adapter exited before complete (code ${String(code)}, signal ${String(signal)})`,
              eventFrames,
              safeStderr,
            ));
          }
        });
      });
      const abort = (): void => fail(new AdapterProtocolError("AGENT_CANCELLED", "Agent was cancelled"));
      input.signal?.addEventListener("abort", abort, { once: true });
      if (input.signal?.aborted) abort();
    });
  }
}

import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { writablePathPrefixes } from "@frontend-agent-benchmark/contracts";
import type { AllowedTool, WorkspaceRunner } from "@frontend-agent-benchmark/tool-router";

export const DOCKER_UNAVAILABLE = "DOCKER_UNAVAILABLE";
export const SANDBOX_IMAGE_UNAVAILABLE = "SANDBOX_IMAGE_UNAVAILABLE";
export const SANDBOX_START_FAILED = "SANDBOX_START_FAILED";
export const SANDBOX_PATCH_CAPTURE_FAILED = "SANDBOX_PATCH_CAPTURE_FAILED";
export const SANDBOX_CLEANUP_FAILED = "SANDBOX_CLEANUP_FAILED";
export const WORKSPACE_WRITABLE_PATH_INVALID = "WORKSPACE_WRITABLE_PATH_INVALID";
export const DEFAULT_PINNED_NODE_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";

const PINNED_IMAGE = /@sha256:[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_RESOURCES: SandboxResources = {
  memoryBytes: 512 * 1024 * 1024,
  cpus: 1,
  pidsLimit: 128,
};

export class SandboxDockerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SandboxDockerError";
  }
}

export interface SandboxAttemptContext {
  runId: string;
  attemptId: string;
  ordinal: number;
  seed: number;
}

export interface SandboxResources {
  memoryBytes: number;
  cpus: number;
  pidsLimit: number;
}

export interface DockerMount {
  source: string;
  target: string;
  readOnly: boolean;
}

export interface DockerContainerSpec {
  name: string;
  image: string;
  user: string;
  workdir: string;
  networkMode: "none";
  readOnlyRootfs: true;
  noNewPrivileges: true;
  resources: SandboxResources;
  mounts: DockerMount[];
  tmpfs: string[];
}

export interface DockerExecSpec {
  command: string[];
  user: string;
  workdir: string;
  input?: string;
}

export interface DockerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DockerClient {
  ping(): Promise<void>;
  inspectImage(reference: string): Promise<{ id: string; repoDigests: string[] } | undefined>;
  createContainer(spec: DockerContainerSpec): Promise<string>;
  startContainer(id: string): Promise<void>;
  execContainer(id: string, spec: DockerExecSpec): Promise<DockerExecResult>;
  removeContainer(id: string): Promise<void>;
}

interface WritableMount {
  prefix: string;
  source: string;
}

interface AttemptState {
  containerId?: string;
  temporaryRoot: string;
  publicBundle: string;
  writableMounts: WritableMount[];
  protectedMounts: WritableMount[];
}

function commandFailure(result: ReturnType<typeof spawnSync>, fallback: string): Error {
  const message = String(result.stderr || result.stdout || result.error?.message || fallback).trim();
  return new Error(message || fallback);
}

export class DockerCliClient implements DockerClient {
  constructor(private readonly timeoutMs = 30_000) {}

  async ping(): Promise<void> {
    const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
      encoding: "utf8",
      timeout: this.timeoutMs,
    });
    if (result.status !== 0) throw commandFailure(result, "Docker daemon is unavailable");
  }

  async inspectImage(reference: string): Promise<{ id: string; repoDigests: string[] } | undefined> {
    const result = spawnSync("docker", ["image", "inspect", reference, "--format", "{{json .}}"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: this.timeoutMs,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return undefined;
    const image = JSON.parse(result.stdout) as { Id?: string; RepoDigests?: string[] };
    return { id: image.Id ?? "", repoDigests: image.RepoDigests ?? [] };
  }

  async createContainer(spec: DockerContainerSpec): Promise<string> {
    const arguments_ = [
      "container", "create",
      "--name", spec.name,
      "--network", spec.networkMode,
      "--read-only",
      "--user", spec.user,
      "--workdir", spec.workdir,
      "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL",
      "--memory", String(spec.resources.memoryBytes),
      "--cpus", String(spec.resources.cpus),
      "--pids-limit", String(spec.resources.pidsLimit),
    ];
    for (const tmpfs of spec.tmpfs) arguments_.push("--tmpfs", tmpfs);
    for (const mount of spec.mounts) {
      arguments_.push("--mount", [
        "type=bind",
        `source=${mount.source}`,
        `target=${mount.target}`,
        ...(mount.readOnly ? ["readonly"] : []),
      ].join(","));
    }
    arguments_.push(spec.image, "sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done");
    const result = spawnSync("docker", arguments_, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: this.timeoutMs,
    });
    if (result.status !== 0) throw commandFailure(result, "Docker container creation failed");
    return result.stdout.trim();
  }

  async startContainer(id: string): Promise<void> {
    const result = spawnSync("docker", ["container", "start", id], {
      encoding: "utf8",
      timeout: this.timeoutMs,
    });
    if (result.status !== 0) throw commandFailure(result, "Docker container start failed");
  }

  async execContainer(id: string, spec: DockerExecSpec): Promise<DockerExecResult> {
    const result = spawnSync("docker", [
      "container", "exec", "-i",
      "--user", spec.user,
      "--workdir", spec.workdir,
      id,
      ...spec.command,
    ], {
      encoding: "utf8",
      input: spec.input,
      maxBuffer: 16 * 1024 * 1024,
      timeout: this.timeoutMs,
    });
    if (result.error) throw result.error;
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async removeContainer(id: string): Promise<void> {
    const result = spawnSync("docker", ["container", "rm", "--force", "--volumes", id], {
      encoding: "utf8",
      timeout: this.timeoutMs,
    });
    if (result.status !== 0 && !String(result.stderr).includes("No such container")) {
      throw commandFailure(result, "Docker container cleanup failed");
    }
  }
}

export function resolvePinnedImageReference(input: {
  taskImage?: string;
  snapshotImageDigest?: string;
  defaultImageReference?: string;
}): string {
  if (input.taskImage && PINNED_IMAGE.test(input.taskImage)) return input.taskImage;
  if (input.taskImage && input.snapshotImageDigest && DIGEST.test(input.snapshotImageDigest)) {
    return `${input.taskImage.replace(/@.*$/, "")}@${input.snapshotImageDigest}`;
  }
  return input.defaultImageReference ?? DEFAULT_PINNED_NODE_IMAGE;
}

export function validateWritablePaths(patterns: string[]): string[] {
  const prefixes = writablePathPrefixes(patterns);
  if (!prefixes) {
    throw new SandboxDockerError(
      WORKSPACE_WRITABLE_PATH_INVALID,
      "writablePaths must be terminal directory-prefix patterns such as src/**",
    );
  }
  return prefixes;
}

export function containerNameForAttempt(attemptId: string): string {
  const safe = attemptId.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 48);
  const suffix = createHash("sha256").update(attemptId).digest("hex").slice(0, 10);
  return `fab-${safe}-${suffix}`;
}

function makeWritable(path: string): void {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) return;
  chmodSync(path, entry.isDirectory() ? entry.mode | 0o777 : entry.mode | 0o666);
  if (entry.isDirectory()) {
    for (const name of readdirSync(path)) makeWritable(join(path, name));
  }
}

function copyDirectory(source: string, target: string): void {
  if (existsSync(source)) {
    if (!lstatSync(source).isDirectory()) {
      throw new SandboxDockerError(
        WORKSPACE_WRITABLE_PATH_INVALID,
        `Writable prefix ${source} is not a directory`,
      );
    }
    cpSync(source, target, { recursive: true });
  } else {
    mkdirSync(target, { recursive: true });
  }
}

function workspacePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) {
    throw new Error("Workspace path is invalid");
  }
  const normalized = posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new Error("Workspace path is invalid");
  }
  return `/workspace/${normalized}`;
}

export class DockerSandboxRuntime implements WorkspaceRunner {
  private readonly client: DockerClient;
  private readonly imageReference: string;
  private readonly bundlePath: string;
  private readonly writablePrefixes: string[];
  private readonly forbiddenPrefixes: string[];
  private readonly buildOutputPrefixes: string[];
  private readonly resources: SandboxResources;
  private readonly commandTimeoutMs: number;
  private readonly states = new Map<string, AttemptState>();
  private activeAttemptId?: string;

  constructor(options: {
    client?: DockerClient;
    imageReference: string;
    bundlePath: string;
    writablePaths: string[];
    forbiddenPaths?: string[];
    buildOutputPaths?: string[];
    resources?: Partial<SandboxResources>;
    commandTimeoutMs?: number;
  }) {
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    this.client = options.client ?? new DockerCliClient(this.commandTimeoutMs);
    this.imageReference = options.imageReference;
    this.bundlePath = resolve(options.bundlePath);
    this.writablePrefixes = validateWritablePaths(options.writablePaths);
    this.forbiddenPrefixes = validateWritablePaths(options.forbiddenPaths ?? []);
    this.buildOutputPrefixes = validateWritablePaths(options.buildOutputPaths ?? []);
    this.resources = { ...DEFAULT_RESOURCES, ...options.resources };
    if (
      !Number.isSafeInteger(this.resources.memoryBytes) || this.resources.memoryBytes <= 0
      || !Number.isFinite(this.resources.cpus) || this.resources.cpus <= 0
      || !Number.isSafeInteger(this.resources.pidsLimit) || this.resources.pidsLimit <= 0
      || !Number.isFinite(this.commandTimeoutMs) || this.commandTimeoutMs <= 0
    ) throw new TypeError("Sandbox resource limits must be positive");
  }

  async start(context: SandboxAttemptContext): Promise<void> {
    if (!PINNED_IMAGE.test(this.imageReference)) {
      throw new SandboxDockerError(SANDBOX_IMAGE_UNAVAILABLE, "Sandbox image reference is not pinned by digest");
    }
    try {
      await this.client.ping();
    } catch (error) {
      throw new SandboxDockerError(
        DOCKER_UNAVAILABLE,
        error instanceof Error ? error.message : "Docker daemon is unavailable",
      );
    }
    let image;
    try {
      image = await this.client.inspectImage(this.imageReference);
    } catch (error) {
      throw new SandboxDockerError(
        DOCKER_UNAVAILABLE,
        error instanceof Error ? error.message : "Docker daemon is unavailable",
      );
    }
    if (!image) {
      throw new SandboxDockerError(
        SANDBOX_IMAGE_UNAVAILABLE,
        `Pinned Sandbox image is unavailable: ${this.imageReference}`,
      );
    }

    const state = this.prepareWorkspace(context.attemptId);
    this.states.set(context.attemptId, state);
    this.activeAttemptId = context.attemptId;
    const mounts: DockerMount[] = [
      { source: state.publicBundle, target: "/workspace", readOnly: true },
      ...state.writableMounts.map(({ prefix, source }) => ({
        source,
        target: `/workspace/${prefix}`,
        readOnly: false,
      })),
      ...state.protectedMounts.map(({ prefix, source }) => ({
        source,
        target: `/workspace/${prefix}`,
        readOnly: true,
      })),
    ];
    for (const prefix of this.buildOutputPrefixes) {
      const source = join(state.temporaryRoot, "build-output", prefix);
      mkdirSync(source, { recursive: true });
      makeWritable(source);
      mounts.push({ source, target: `/workspace/${prefix}`, readOnly: false });
    }

    try {
      state.containerId = await this.client.createContainer({
        name: containerNameForAttempt(context.attemptId),
        image: this.imageReference,
        user: "1000:1000",
        workdir: "/workspace",
        networkMode: "none",
        readOnlyRootfs: true,
        noNewPrivileges: true,
        resources: this.resources,
        mounts,
        tmpfs: ["/tmp:rw,nosuid,nodev,noexec,mode=1777"],
      });
      await this.client.startContainer(state.containerId);
    } catch (error) {
      try {
        await this.cleanup(context);
      } catch (cleanupError) {
        throw cleanupError;
      }
      throw new SandboxDockerError(
        SANDBOX_START_FAILED,
        error instanceof Error ? error.message : "Sandbox container failed to start",
      );
    }
  }

  async run(tool: AllowedTool, arguments_: Record<string, unknown>): Promise<string> {
    if (tool === "echo") return String(arguments_.message ?? "");
    const state = this.activeState();
    let result: DockerExecResult;
    if (tool === "read_file") {
      result = await this.client.execContainer(state.containerId!, {
        user: "1000:1000",
        workdir: "/workspace",
        command: [
          "node", "-e",
          "process.stdout.write(require('node:fs').readFileSync(process.argv[1]))",
          workspacePath(arguments_.path),
        ],
      });
    } else if (tool === "write_file") {
      const path = workspacePath(arguments_.path);
      const content = String(arguments_.content ?? "");
      result = await this.client.execContainer(state.containerId!, {
        user: "1000:1000",
        workdir: "/workspace",
        command: [
          "node", "-e",
          "const f=require('node:fs'),p=process.argv[1];f.mkdirSync(require('node:path').dirname(p),{recursive:true});f.writeFileSync(p,f.readFileSync(0))",
          path,
        ],
        input: content,
      });
      if (result.exitCode === 0) return content;
    } else {
      const cwd = arguments_.cwd === undefined ? "/workspace" : workspacePath(arguments_.cwd);
      result = await this.client.execContainer(state.containerId!, {
        user: "1000:1000",
        workdir: cwd,
        command: ["sh", "-lc", String(arguments_.command ?? "")],
      });
    }
    if (result.exitCode !== 0) {
      throw new Error((result.stderr || result.stdout || `Command exited ${result.exitCode}`).trim());
    }
    return result.stdout + result.stderr;
  }

  async capturePatch(context: SandboxAttemptContext): Promise<string> {
    const state = this.states.get(context.attemptId);
    if (!state) throw new SandboxDockerError(SANDBOX_PATCH_CAPTURE_FAILED, "Attempt workspace is unavailable");
    const patchRoot = join(state.temporaryRoot, "patch");
    const base = join(patchRoot, "base");
    const current = join(patchRoot, "current");
    try {
      cpSync(this.bundlePath, base, { recursive: true });
      cpSync(this.bundlePath, current, { recursive: true });
      for (const mount of [...state.writableMounts].sort((left, right) => left.prefix.localeCompare(right.prefix))) {
        const target = join(current, ...mount.prefix.split("/"));
        rmSync(target, { recursive: true, force: true });
        mkdirSync(dirname(target), { recursive: true });
        cpSync(mount.source, target, { recursive: true });
      }
      const result = spawnSync("git", [
        "diff", "--no-index", "--binary", "--no-ext-diff", "--no-renames",
        "--src-prefix=a/", "--dst-prefix=b/", "--", "base", "current",
      ], {
        cwd: patchRoot,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 16 * 1024 * 1024,
        timeout: this.commandTimeoutMs,
      });
      if (result.status !== 0 && result.status !== 1) throw commandFailure(result, "Patch capture failed");
      return result.stdout.split("\n").map((line) => (
        /^(?:diff --git |--- |\+\+\+ |Binary files )/.test(line)
          ? line
              .replaceAll("a/base/", "a/")
              .replaceAll("a/current/", "a/")
              .replaceAll("b/base/", "b/")
              .replaceAll("b/current/", "b/")
          : line
      )).join("\n");
    } catch (error) {
      throw new SandboxDockerError(
        SANDBOX_PATCH_CAPTURE_FAILED,
        error instanceof Error ? error.message : "Patch capture failed",
      );
    }
  }

  async cleanup(context: SandboxAttemptContext): Promise<void> {
    const state = this.states.get(context.attemptId);
    if (!state) return;
    try {
      if (state.containerId) {
        await this.client.removeContainer(state.containerId);
        state.containerId = undefined;
      }
      rmSync(state.temporaryRoot, { recursive: true, force: true });
      this.states.delete(context.attemptId);
      if (this.activeAttemptId === context.attemptId) this.activeAttemptId = undefined;
    } catch (error) {
      throw new SandboxDockerError(
        SANDBOX_CLEANUP_FAILED,
        error instanceof Error ? error.message : "Sandbox cleanup failed",
      );
    }
  }

  private prepareWorkspace(attemptId: string): AttemptState {
    const temporaryRoot = mkdtempSync(join(tmpdir(), `${containerNameForAttempt(attemptId)}-`));
    try {
      const publicBundle = join(temporaryRoot, "bundle");
      cpSync(this.bundlePath, publicBundle, { recursive: true });
      const writableMounts = this.writablePrefixes.map((prefix, index) => {
        const source = join(temporaryRoot, "writable", String(index));
        copyDirectory(join(this.bundlePath, ...prefix.split("/")), source);
        makeWritable(source);
        mkdirSync(join(publicBundle, ...prefix.split("/")), { recursive: true });
        return { prefix, source };
      });
      const ensureNestedTarget = (prefix: string): void => {
        mkdirSync(join(publicBundle, ...prefix.split("/")), { recursive: true });
        for (const writable of writableMounts) {
          if (prefix.startsWith(`${writable.prefix}/`)) {
            mkdirSync(join(writable.source, ...prefix.slice(writable.prefix.length + 1).split("/")), {
              recursive: true,
            });
          }
        }
      };
      const protectedMounts = this.forbiddenPrefixes.map((prefix, index) => {
        const source = join(temporaryRoot, "protected", String(index));
        copyDirectory(join(this.bundlePath, ...prefix.split("/")), source);
        ensureNestedTarget(prefix);
        return { prefix, source };
      });
      for (const prefix of this.buildOutputPrefixes) ensureNestedTarget(prefix);
      return { temporaryRoot, publicBundle, writableMounts, protectedMounts };
    } catch (error) {
      rmSync(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }

  private activeState(): AttemptState {
    const state = this.activeAttemptId ? this.states.get(this.activeAttemptId) : undefined;
    if (!state?.containerId) throw new SandboxDockerError(SANDBOX_START_FAILED, "Sandbox is not running");
    return state;
  }
}

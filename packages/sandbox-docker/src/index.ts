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

import { collectFrozenSnapshot } from "@frontend-agent-benchmark/artifact-store-fs";
import { writablePathPrefixes } from "@frontend-agent-benchmark/contracts";
import type { AllowedTool, WorkspaceRunner } from "@frontend-agent-benchmark/tool-router";

export const DOCKER_UNAVAILABLE = "DOCKER_UNAVAILABLE";
export const SANDBOX_IMAGE_UNAVAILABLE = "SANDBOX_IMAGE_UNAVAILABLE";
export const SANDBOX_START_FAILED = "SANDBOX_START_FAILED";
export const SANDBOX_PATCH_CAPTURE_FAILED = "SANDBOX_PATCH_CAPTURE_FAILED";
export const SANDBOX_CLEANUP_FAILED = "SANDBOX_CLEANUP_FAILED";
export const SANDBOX_RESIDUAL_PROCESSES = "SANDBOX_RESIDUAL_PROCESSES";
export const NETWORK_POLICY_VIOLATION = "NETWORK_POLICY_VIOLATION";
export const DEPENDENCY_PROXY_UNAVAILABLE = "DEPENDENCY_PROXY_UNAVAILABLE";
export const WORKSPACE_WRITABLE_PATH_INVALID = "WORKSPACE_WRITABLE_PATH_INVALID";
export const DEFAULT_PINNED_NODE_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
export const DEFAULT_PINNED_PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.59.1-noble@sha256:b0ab6f3cb99aa7803adbc14d9027ec1785fc6e433b97e134e0f8fe61683b6b53";

const PINNED_IMAGE = /@sha256:[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PROXY_PROBE_TIMEOUT_MS = 10_000;
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
  networkMode: string;
  networkAliases?: string[];
  environment?: Record<string, string>;
  dns?: string[];
  extraHosts?: string[];
  readOnlyRootfs: true;
  noNewPrivileges: true;
  resources: SandboxResources;
  mounts: DockerMount[];
  tmpfs: string[];
  command?: string[];
}

export interface DockerNetworkSpec { name: string; internal: true; labels: Record<string, string> }

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

interface ServiceConfig {
  image: string;
  command: string[];
  port: number;
  fixtureDirectory?: string;
}

export interface DockerClient {
  ping(): Promise<void>;
  inspectImage(reference: string): Promise<{ id: string; repoDigests: string[] } | undefined>;
  createContainer(spec: DockerContainerSpec): Promise<string>;
  startContainer(id: string): Promise<void>;
  execContainer(id: string, spec: DockerExecSpec): Promise<DockerExecResult>;
  removeContainer(id: string): Promise<void>;
  createNetwork(spec: DockerNetworkSpec): Promise<string>;
  removeNetwork(id: string): Promise<void>;
  listNetworks(label: string): Promise<string[]>;
  containerNetworkIp(id: string, networkId: string): Promise<string>;
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
  networkId?: string;
  serviceContainerIds: string[];
  serviceHosts: string[];
  frozen?: boolean;
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
    for (const alias of spec.networkAliases ?? []) arguments_.push("--network-alias", alias);
    for (const [name, value] of Object.entries(spec.environment ?? {})) arguments_.push("--env", `${name}=${value}`);
    for (const dns of spec.dns ?? []) arguments_.push("--dns", dns);
    for (const host of spec.extraHosts ?? []) arguments_.push("--add-host", host);
    for (const mount of spec.mounts) {
      arguments_.push("--mount", [
        "type=bind",
        `source=${mount.source}`,
        `target=${mount.target}`,
        ...(mount.readOnly ? ["readonly"] : []),
      ].join(","));
    }
    arguments_.push(spec.image, ...(spec.command ?? ["sh", "-c", "trap 'exit 0' TERM INT; while :; do sleep 3600; done"]));
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

  async createNetwork(spec: DockerNetworkSpec): Promise<string> {
    const result = spawnSync("docker", ["network", "create", "--internal", "--label", ...Object.entries(spec.labels)
      .flatMap(([key, value]) => [`${key}=${value}`]), spec.name], { encoding: "utf8", timeout: this.timeoutMs });
    if (result.status !== 0) throw commandFailure(result, "Docker network creation failed");
    return result.stdout.trim();
  }

  async removeNetwork(id: string): Promise<void> {
    const result = spawnSync("docker", ["network", "rm", id], { encoding: "utf8", timeout: this.timeoutMs });
    if (result.status !== 0 && !String(result.stderr).includes("No such network")) {
      throw commandFailure(result, "Docker network cleanup failed");
    }
  }

  async listNetworks(label: string): Promise<string[]> {
    const result = spawnSync("docker", ["network", "ls", "--filter", `label=${label}`, "--format", "{{.ID}}"], { encoding: "utf8", timeout: this.timeoutMs });
    if (result.status !== 0) throw commandFailure(result, "Docker network listing failed");
    return result.stdout.split("\n").filter(Boolean);
  }

  async containerNetworkIp(id: string, networkId: string): Promise<string> {
    // Docker keys NetworkSettings.Networks by network name, so match on the entry's NetworkID.
    const result = spawnSync("docker", ["container", "inspect", "--format", `{{range .NetworkSettings.Networks}}{{if eq .NetworkID \"${networkId}\"}}{{.IPAddress}}{{end}}{{end}}`, id], { encoding: "utf8", timeout: this.timeoutMs });
    const ip = result.stdout.trim();
    if (result.status !== 0 || !ip) throw commandFailure(result, "Docker service network address is unavailable");
    return ip;
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

export function networkNameForAttempt(attemptId: string): string {
  return `${containerNameForAttempt(attemptId)}-network`;
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

function fixtureDirectory(bundlePath: string, directory: string): string {
  const source = resolve(bundlePath, directory);
  if (source !== bundlePath && !source.startsWith(`${bundlePath}/`)) {
    throw new SandboxDockerError(DEPENDENCY_PROXY_UNAVAILABLE, "Package proxy fixture directory escapes the task bundle");
  }
  if (!existsSync(source) || !lstatSync(source).isDirectory()) {
    throw new SandboxDockerError(DEPENDENCY_PROXY_UNAVAILABLE, "Package proxy fixture directory is unavailable");
  }
  return source;
}

function registryEnvironment(port: number): Record<string, string> {
  const registry = `http://package-proxy:${port}/`;
  // The rootfs is read-only, so npm's cache/logs must live on the /tmp tmpfs.
  return {
    npm_config_registry: registry,
    NPM_CONFIG_REGISTRY: registry,
    npm_config_cache: "/tmp/.npm",
    npm_config_update_notifier: "false",
    npm_config_audit: "false",
    npm_config_fund: "false",
    HOME: "/tmp",
  };
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
    services?: { mockApi?: ServiceConfig; packageProxy?: ServiceConfig };
    excludedBundlePaths?: string[];
    playwrightImage?: string;
    playwrightRuntimePath?: string;
    /** Create the internal network even without services so the evaluated app is reachable at http://app:<port>. */
    appNetwork?: boolean;
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
    this.services = options.services;
    this.excludedBundlePaths = options.excludedBundlePaths ?? [];
    this.playwrightImage = options.playwrightImage ?? DEFAULT_PINNED_PLAYWRIGHT_IMAGE;
    this.playwrightRuntimePath = options.playwrightRuntimePath;
    this.appNetwork = options.appNetwork ?? false;
    if (
      !Number.isSafeInteger(this.resources.memoryBytes) || this.resources.memoryBytes <= 0
      || !Number.isFinite(this.resources.cpus) || this.resources.cpus <= 0
      || !Number.isSafeInteger(this.resources.pidsLimit) || this.resources.pidsLimit <= 0
      || !Number.isFinite(this.commandTimeoutMs) || this.commandTimeoutMs <= 0
    ) throw new TypeError("Sandbox resource limits must be positive");
  }

  private readonly services?: { mockApi?: ServiceConfig; packageProxy?: ServiceConfig };
  private readonly excludedBundlePaths: string[];
  private readonly playwrightImage: string;
  private readonly playwrightRuntimePath: string | undefined;
  private readonly appNetwork: boolean;

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
      // Agent containers stay on `--network none` unless the Task declares in-Run services or an app to evaluate.
      if (this.services?.mockApi || this.services?.packageProxy || this.appNetwork) {
        state.networkId = await this.client.createNetwork({
          name: networkNameForAttempt(context.attemptId), internal: true,
          labels: { "frontend-agent-benchmark.attempt": context.attemptId },
        });
        for (const [alias, service] of Object.entries({ "mock-api": this.services?.mockApi, "package-proxy": this.services?.packageProxy })) {
          if (!service) continue;
          const id = await this.client.createContainer({
            name: `${containerNameForAttempt(context.attemptId)}-${alias}`,
            image: service.image, user: "1000:1000", workdir: "/tmp", networkMode: state.networkId,
            networkAliases: [alias], readOnlyRootfs: true, noNewPrivileges: true, resources: this.resources,
            mounts: service.fixtureDirectory ? [{
              source: fixtureDirectory(this.bundlePath, service.fixtureDirectory), target: "/fixtures", readOnly: true,
            }] : [],
            tmpfs: ["/tmp:rw,nosuid,nodev,noexec,mode=1777"], command: service.command,
          });
          state.serviceContainerIds.push(id);
          await this.client.startContainer(id);
          state.serviceHosts.push(`${alias}:${await this.client.containerNetworkIp(id, state.networkId)}`);
          if (alias === "package-proxy") {
            // Any HTTP response proves the proxy is listening; the root path may legitimately 404.
            // Poll briefly because the server process needs a moment after container start.
            const health = await this.client.execContainer(id, {
              user: "1000:1000", workdir: "/tmp",
              command: ["node", "-e", `(async()=>{const d=Date.now()+${PROXY_PROBE_TIMEOUT_MS};for(;;){try{await fetch('http://127.0.0.1:${service.port}/');process.exit(0)}catch{if(Date.now()>d)process.exit(1);await new Promise(r=>setTimeout(r,200))}}})()`],
            });
            if (health.exitCode !== 0) {
              throw new SandboxDockerError(DEPENDENCY_PROXY_UNAVAILABLE, "Controlled package proxy is unavailable");
            }
          }
        }
      }
      state.containerId = await this.client.createContainer({
        name: containerNameForAttempt(context.attemptId),
        image: this.imageReference,
        user: "1000:1000",
        workdir: "/workspace",
        networkMode: state.networkId ?? "none",
        ...(state.networkId ? { dns: ["127.0.0.1"], extraHosts: state.serviceHosts } : {}),
        ...(state.networkId && this.appNetwork ? { networkAliases: ["app"] } : {}),
        ...(this.services?.packageProxy ? { environment: registryEnvironment(this.services.packageProxy.port) } : {}),
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
      if (error instanceof SandboxDockerError) throw error;
      throw new SandboxDockerError(SANDBOX_START_FAILED, error instanceof Error ? error.message : "Sandbox container failed to start");
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

  /** Starts the evaluated app and probes it from within its internal network. */
  async startApp(command: string, port: number, timeoutMs = 30_000): Promise<{ log: string; ready: boolean }> {
    const state = this.activeState();
    const start = await this.client.execContainer(state.containerId!, { user: "1000:1000", workdir: "/workspace", command: ["sh", "-lc", `(${command}) >/tmp/fab-start.log 2>&1 & echo $!`] });
    if (start.exitCode !== 0) return { log: start.stdout + start.stderr, ready: false };
    const probe = `const d=Date.now()+${timeoutMs};(async()=>{for(;;){try{const r=await fetch('http://app:${port}/');if(r.status<500)process.exit(0)}catch{}if(Date.now()>d)process.exit(1);await new Promise(r=>setTimeout(r,200))}})()`;
    const ready = await this.client.execContainer(state.containerId!, { user: "1000:1000", workdir: "/tmp", command: ["node", "-e", probe] });
    const log = await this.client.execContainer(state.containerId!, { user: "1000:1000", workdir: "/tmp", command: ["sh", "-lc", "cat /tmp/fab-start.log 2>/dev/null || true"] });
    return { log: log.stdout + log.stderr, ready: ready.exitCode === 0 };
  }

  /** Runs opaque host-supplied code inside an isolated browser container; no host mount is used. */
  async runPlaywright(input: string): Promise<DockerExecResult> {
    const state = this.activeState();
    if (!state.networkId || !PINNED_IMAGE.test(this.playwrightImage)) throw new SandboxDockerError(SANDBOX_IMAGE_UNAVAILABLE, "Pinned Playwright image is unavailable");
    const image = await this.client.inspectImage(this.playwrightImage);
    if (!image) throw new SandboxDockerError(SANDBOX_IMAGE_UNAVAILABLE, `Pinned Playwright image is unavailable: ${this.playwrightImage}`);
    // The official image ships browsers but no library; the matching playwright-core is vendored host-side and mounted read-only.
    const runtime = this.playwrightRuntimePath;
    if (!runtime || !existsSync(join(runtime, "node_modules", "playwright-core", "package.json"))) {
      throw new SandboxDockerError(SANDBOX_IMAGE_UNAVAILABLE, "Playwright runtime library mount is unavailable");
    }
    const id = await this.client.createContainer({ name: `${containerNameForAttempt(this.activeAttemptId!)}-playwright`, image: this.playwrightImage, user: "1001:1001", workdir: "/tmp", networkMode: state.networkId, readOnlyRootfs: true, noNewPrivileges: true, resources: this.resources, mounts: [{ source: runtime, target: "/opt/playwright-runtime", readOnly: true }], tmpfs: ["/tmp:rw,nosuid,nodev,noexec,mode=1777", "/dev/shm:rw,nosuid,nodev,size=256m"], environment: { NODE_PATH: "/opt/playwright-runtime/node_modules", HOME: "/tmp", PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright" } });
    try { await this.client.startContainer(id); return await this.client.execContainer(id, { user: "1001:1001", workdir: "/tmp", command: ["node", "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>Function('require',s)(require))"], input }); }
    finally { await this.client.removeContainer(id); }
  }

  async capturePatch(context: SandboxAttemptContext): Promise<string> {
    const state = this.states.get(context.attemptId);
    if (!state) throw new SandboxDockerError(SANDBOX_PATCH_CAPTURE_FAILED, "Attempt workspace is unavailable");
    const patchRoot = join(state.temporaryRoot, "patch");
    const base = join(patchRoot, "base");
    const current = join(patchRoot, "current");
    try {
      this.copyPublicBundle(base);
      this.copyPublicBundle(current);
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

  async freeze(context: SandboxAttemptContext): Promise<string> {
    const state = this.states.get(context.attemptId);
    if (!state?.containerId) throw new SandboxDockerError(SANDBOX_RESIDUAL_PROCESSES, "Agent container is unavailable for census");
    const census = async (): Promise<string> => {
      const result = await this.client.execContainer(state.containerId!, {
        user: "0:0", workdir: "/", command: ["sh", "-lc", "ps -eo pid=,args="],
      });
      if (result.exitCode !== 0) throw new SandboxDockerError(SANDBOX_RESIDUAL_PROCESSES, "Process census failed");
      return result.stdout;
    };
    state.frozen = true;
    const pre = await census();
    const residual = (output: string) => output.split("\n").map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      // busybox ps re-renders "-eo pid=,args=" as "-eo pid= args=", so match the census loosely.
      const isCensus = /\bps -eo pid=/.test(match?.[2] ?? "") || /\bsh -lc ps -eo pid=/.test(match?.[2] ?? "");
      return match && !isCensus && !/\btrap .*sleep\b/.test(match[2]) && !/\bsleep 3600\b/.test(match[2]) ? match[1] : undefined;
    }).filter((pid): pid is string => pid !== undefined && pid !== "1");
    const preResidual = residual(pre);
    if (preResidual.length) {
      const pids = preResidual.join(" ");
      // Capabilities are dropped, so exec-as-root lacks CAP_KILL; signal as the sandbox user that owns the processes.
      await this.client.execContainer(state.containerId, { user: "1000:1000", workdir: "/", command: ["sh", "-c", `kill -TERM ${pids} 2>/dev/null || true; sleep 1; kill -KILL ${pids} 2>/dev/null || true`] });
    }
    const post = await census();
    if (residual(post).length) throw new SandboxDockerError(SANDBOX_RESIDUAL_PROCESSES, "Residual Agent processes remain after cleanup");
    return JSON.stringify({ pre: pre.trim().split("\n").filter(Boolean), post: post.trim().split("\n").filter(Boolean) }) + "\n";
  }

  async snapshot(context: SandboxAttemptContext, destination: string): Promise<string> {
    const state = this.states.get(context.attemptId);
    if (!state) throw new SandboxDockerError(SANDBOX_PATCH_CAPTURE_FAILED, "Attempt workspace is unavailable");
    const current = join(state.temporaryRoot, "snapshot-current");
    try {
      this.copyPublicBundle(current);
      for (const mount of state.writableMounts) {
        const target = join(current, ...mount.prefix.split("/"));
        rmSync(target, { recursive: true, force: true });
        cpSync(mount.source, target, { recursive: true });
      }
      return collectFrozenSnapshot(current, destination, [...this.buildOutputPrefixes, "node_modules"]).digest;
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      throw new SandboxDockerError("SNAPSHOT_UNSAFE_ENTRY", error instanceof Error ? error.message : "Snapshot collection failed");
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
      for (const id of state.serviceContainerIds.reverse()) await this.client.removeContainer(id);
      if (state.networkId) {
        await this.client.removeNetwork(state.networkId);
        const remaining = await this.client.listNetworks(`frontend-agent-benchmark.attempt=${context.attemptId}`);
        if (remaining.length) throw new Error("Attempt network still exists after cleanup");
        state.networkId = undefined;
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

  isFrozen(context: SandboxAttemptContext): boolean {
    return this.states.get(context.attemptId)?.frozen === true;
  }

  private prepareWorkspace(attemptId: string): AttemptState {
    const temporaryRoot = mkdtempSync(join(tmpdir(), `${containerNameForAttempt(attemptId)}-`));
    try {
      const publicBundle = join(temporaryRoot, "bundle");
      this.copyPublicBundle(publicBundle);
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
      const protectedMounts = this.forbiddenPrefixes.filter((prefix) => !this.excludedBundlePaths.some((excluded) => prefix === excluded || prefix.startsWith(`${excluded}/`))).map((prefix, index) => {
        const source = join(temporaryRoot, "protected", String(index));
        copyDirectory(join(this.bundlePath, ...prefix.split("/")), source);
        ensureNestedTarget(prefix);
        return { prefix, source };
      });
      for (const prefix of this.buildOutputPrefixes) ensureNestedTarget(prefix);
      return { temporaryRoot, publicBundle, writableMounts, protectedMounts, serviceContainerIds: [], serviceHosts: [] };
    } catch (error) {
      rmSync(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }

  private copyPublicBundle(target: string): void {
    cpSync(this.bundlePath, target, { recursive: true });
    for (const path of this.excludedBundlePaths) rmSync(join(target, ...path.split("/")), { recursive: true, force: true });
  }

  private activeState(): AttemptState {
    const state = this.activeAttemptId ? this.states.get(this.activeAttemptId) : undefined;
    if (!state?.containerId) throw new SandboxDockerError(SANDBOX_START_FAILED, "Sandbox is not running");
    return state;
  }

  agentNetworkId(context: SandboxAttemptContext): string | undefined {
    return this.states.get(context.attemptId)?.networkId;
  }
}

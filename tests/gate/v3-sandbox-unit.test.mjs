import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const sandboxModule = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const contractsModule = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);

const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const context = { runId: "run-1", attemptId: "attempt-1", ordinal: 1, seed: 7 };

class FakeDockerClient {
  actions = [];
  daemonError = undefined;
  image = { id: "sha256:image", repoDigests: [PINNED_IMAGE] };

  async ping() {
    this.actions.push("ping");
    if (this.daemonError) throw this.daemonError;
  }

  async inspectImage(reference) {
    this.actions.push(`inspect:${reference}`);
    return this.image;
  }

  async createContainer(spec) {
    this.actions.push("create");
    this.createSpec = spec;
    return "container-1";
  }

  async startContainer(id) {
    this.actions.push(`start:${id}`);
  }

  async execContainer(id, spec) {
    this.actions.push(`exec:${id}:${spec.command.at(-1)}`);
    if (spec.input !== undefined) {
      const containerPath = spec.command.at(-1);
      const mount = this.createSpec.mounts
        .filter(({ target }) => containerPath.startsWith(`${target}/`))
        .sort((left, right) => right.target.length - left.target.length)[0];
      const hostPath = join(mount.source, containerPath.slice(mount.target.length + 1));
      mkdirSync(dirname(hostPath), { recursive: true });
      writeFileSync(hostPath, spec.input);
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: "1000\n", stderr: "" };
  }

  async removeContainer(id) {
    this.actions.push(`remove:${id}`);
    if (this.removeError) throw this.removeError;
  }
}

function bundle() {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v3-unit-"));
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "input.js"), "export const input = true;\n");
  return directory;
}

test("GATE-V3.1-001: Docker daemon and pinned image failures have stable pre-agent codes", async () => {
  const { DockerSandboxRuntime, SandboxDockerError } = await import(sandboxModule);
  const directory = bundle();
  try {
    const daemonClient = new FakeDockerClient();
    daemonClient.daemonError = new Error("socket unavailable");
    const daemonRuntime = new DockerSandboxRuntime({
      client: daemonClient,
      imageReference: PINNED_IMAGE,
      bundlePath: directory,
      writablePaths: ["src/**"],
    });
    await assert.rejects(
      daemonRuntime.start(context),
      (error) => error instanceof SandboxDockerError && error.code === "DOCKER_UNAVAILABLE",
    );
    assert.deepEqual(daemonClient.actions, ["ping"]);

    const imageClient = new FakeDockerClient();
    imageClient.image = undefined;
    const imageRuntime = new DockerSandboxRuntime({
      client: imageClient,
      imageReference: PINNED_IMAGE,
      bundlePath: directory,
      writablePaths: ["src/**"],
    });
    await assert.rejects(
      imageRuntime.start(context),
      (error) => error instanceof SandboxDockerError && error.code === "SANDBOX_IMAGE_UNAVAILABLE",
    );
    assert.deepEqual(imageClient.actions, ["ping", `inspect:${PINNED_IMAGE}`]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V3.1-002: lifecycle creates the locked-down Attempt container before tool execution", async () => {
  const { DockerSandboxRuntime } = await import(sandboxModule);
  const directory = bundle();
  const client = new FakeDockerClient();
  try {
    const runtime = new DockerSandboxRuntime({
      client,
      imageReference: PINNED_IMAGE,
      bundlePath: directory,
      writablePaths: ["src/**"],
      resources: { memoryBytes: 268_435_456, cpus: 0.5, pidsLimit: 64 },
    });
    await runtime.start(context);
    assert.equal(await runtime.run("run_command", { command: "id -u" }), "1000\n");
    assert.deepEqual(client.actions.slice(0, 5), [
      "ping",
      `inspect:${PINNED_IMAGE}`,
      "create",
      "start:container-1",
      "exec:container-1:id -u",
    ]);
    assert.deepEqual({
      networkMode: client.createSpec.networkMode,
      readOnlyRootfs: client.createSpec.readOnlyRootfs,
      user: client.createSpec.user,
      workdir: client.createSpec.workdir,
      noNewPrivileges: client.createSpec.noNewPrivileges,
      memoryBytes: client.createSpec.resources.memoryBytes,
      cpus: client.createSpec.resources.cpus,
      pidsLimit: client.createSpec.resources.pidsLimit,
    }, {
      networkMode: "none",
      readOnlyRootfs: true,
      user: "1000:1000",
      workdir: "/workspace",
      noNewPrivileges: true,
      memoryBytes: 268_435_456,
      cpus: 0.5,
      pidsLimit: 64,
    });
    assert.ok(client.createSpec.mounts.some(({ target, readOnly }) => (
      target === "/workspace" && readOnly
    )));
    assert.ok(client.createSpec.mounts.some(({ target, readOnly }) => (
      target === "/workspace/src" && !readOnly
    )));
    await runtime.run("write_file", {
      path: "src/docker-agent.txt",
      content: "literal a/base/value must survive\n",
    });
    const patch = await runtime.capturePatch(context);
    assert.match(patch, /diff --git a\/src\/docker-agent\.txt b\/src\/docker-agent\.txt/);
    assert.match(patch, /\+literal a\/base\/value must survive/);
    await runtime.cleanup(context);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V3.1-003: cleanup is keyed by Attempt and idempotent", async () => {
  const { DockerSandboxRuntime } = await import(sandboxModule);
  const directory = bundle();
  const client = new FakeDockerClient();
  try {
    const runtime = new DockerSandboxRuntime({
      client,
      imageReference: PINNED_IMAGE,
      bundlePath: directory,
      writablePaths: ["src/**"],
    });
    await runtime.start(context);
    await runtime.cleanup(context);
    await runtime.cleanup(context);
    assert.equal(client.actions.filter((action) => action === "remove:container-1").length, 1);

    const failingClient = new FakeDockerClient();
    const failingRuntime = new DockerSandboxRuntime({
      client: failingClient,
      imageReference: PINNED_IMAGE,
      bundlePath: directory,
      writablePaths: ["src/**"],
    });
    await failingRuntime.start({ ...context, attemptId: "attempt-cleanup-failure" });
    failingClient.removeError = new Error("remove failed");
    await assert.rejects(
      failingRuntime.cleanup({ ...context, attemptId: "attempt-cleanup-failure" }),
      { code: "SANDBOX_CLEANUP_FAILED" },
    );
    failingClient.removeError = undefined;
    await failingRuntime.cleanup({ ...context, attemptId: "attempt-cleanup-failure" });
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V3.1-004: only terminal directory-prefix writablePaths pass Task preflight", async () => {
  const [{ validateWritablePaths }, { preflightTaskBundle }] = await Promise.all([
    import(sandboxModule),
    import(contractsModule),
  ]);
  assert.deepEqual(validateWritablePaths(["src/**", "tests/unit/**"]), ["src", "tests/unit"]);
  for (const invalid of ["src/*.ts", "**/src", "src/**/generated", "../src/**", "/src/**"])
    assert.throws(() => validateWritablePaths([invalid]), { code: "WORKSPACE_WRITABLE_PATH_INVALID" });

  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v3-preflight-"));
  try {
    cpSync(passingBundle, directory, { recursive: true });
    const taskPath = join(directory, "task.yaml");
    const task = await import("node:fs").then(({ readFileSync }) => readFileSync(taskPath, "utf8"));
    writeFileSync(taskPath, task.replace("writablePaths: []", "writablePaths:\n    - src/*.ts"));
    const result = preflightTaskBundle(directory);
    assert.equal(result.preflight, "rejected");
    assert.equal(result.codes[0].code, "WORKSPACE_WRITABLE_PATH_INVALID");
  } finally {
    rmSync(directory, { recursive: true });
  }
});

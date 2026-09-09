import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const sandboxModule = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);

// Docker Hub official node:22-alpine multi-platform index, pinned 2026-07-17.
const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
  encoding: "utf8",
});
const unavailable = daemon.error || daemon.status !== 0
  ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}`
  : false;

function cli(...args) {
  return spawnSync("pnpm", ["eval", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function successfulJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function prepareBundle(root) {
  const directory = join(root, "bundle");
  cpSync(passingBundle, directory, { recursive: true });
  const taskPath = join(directory, "task.yaml");
  const task = readFileSync(taskPath, "utf8")
    .replace("image: synthetic-image", "image: node:22-alpine")
    .replace("maxWallTimeSeconds: 1", "maxWallTimeSeconds: 30")
    .replace("maxAgentSteps: 1", "maxAgentSteps: 8")
    .replace("writablePaths: []", "writablePaths:\n    - src/**");
  writeFileSync(taskPath, task);
  const snapshotPath = join(directory, "dependency-cache-snapshot.json");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  snapshot.imageDigest = PINNED_IMAGE.slice(PINNED_IMAGE.indexOf("@") + 1);
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "input.js"), "export const original = true;\n");
  return directory;
}

function toolResults(shown) {
  return shown.adapterFrames
    .filter(({ direction, type }) => direction === "coordinator_to_adapter" && type === "tool_result")
    .map(({ frameJson }) => JSON.parse(frameJson).payload);
}

test("GATE-V3.1-Docker: mock Adapter runs in a fresh locked-down real container", {
  skip: unavailable,
  timeout: 120_000,
}, async () => {
  const image = spawnSync("docker", ["image", "inspect", PINNED_IMAGE], { encoding: "utf8" });
  if (image.status !== 0) {
    const pull = spawnSync("docker", ["pull", PINNED_IMAGE], {
      encoding: "utf8",
      timeout: 90_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.equal(pull.status, 0, pull.stderr || pull.stdout);
  }

  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v3-docker-"));
  const databasePath = join(root, "eval.sqlite");
  const bundle = prepareBundle(root);
  const { containerNameForAttempt } = await import(sandboxModule);
  try {
    const run = () => {
      const created = successfulJson(cli(
        "run", "create", bundle, "--seed", "7", "--sandbox", "docker", "--db", databasePath,
      ));
      successfulJson(cli(
        "run", "execute", created.runId, "--agent", "mock", "--sandbox", "docker", "--db", databasePath,
      ));
      return successfulJson(cli("run", "show", created.runId, "--db", databasePath));
    };

    const first = run();
    assert.equal(first.run.status, "COMPLETED");
    const firstInput = JSON.parse(first.run.resolvedInputJson);
    assert.deepEqual({
      runner: firstInput.sandbox.runner,
      imageReference: firstInput.sandbox.imageReference,
    }, { runner: "docker", imageReference: PINNED_IMAGE });
    const firstAttempt = first.attempts[0];
    const firstPatch = readFileSync(
      join(root, first.run.runId, "attempts", "1", "patch.diff"),
      "utf8",
    );
    assert.match(firstPatch, /src\/docker-agent\.txt/);
    assert.match(firstPatch, new RegExp(firstAttempt.attemptId));

    const firstResults = toolResults(first);
    assert.equal(firstResults[0].status, "failed", "fresh workspace must not retain a prior write");
    assert.equal(firstResults[1].status, "succeeded", "allowed write_file must succeed");
    assert.equal(firstResults[2].status, "succeeded", "id command must succeed");
    assert.notEqual(Number(firstResults[2].output.text.trim()), 0, "commands must run as non-root");
    assert.equal(firstResults[3].status, "failed", "protected-root write must fail at the OS boundary");
    assert.ok(["TOOL_EXECUTION_FAILED", "TOOL_POLICY_DENIED"].includes(firstResults[3].errorCode));
    assert.equal(existsSync(join(bundle, "protected.txt")), false);
    assert.notEqual(
      spawnSync("docker", ["container", "inspect", containerNameForAttempt(firstAttempt.attemptId)]).status,
      0,
      "Attempt container must be removed",
    );

    const second = run();
    const secondAttempt = second.attempts[0];
    assert.equal(second.run.status, "COMPLETED");
    assert.notEqual(secondAttempt.attemptId, firstAttempt.attemptId);
    assert.equal(toolResults(second)[0].status, "failed", "second Run must start from the public bundle");
    const secondPatch = readFileSync(
      join(root, second.run.runId, "attempts", "1", "patch.diff"),
      "utf8",
    );
    assert.match(secondPatch, new RegExp(secondAttempt.attemptId));
    assert.doesNotMatch(secondPatch, new RegExp(firstAttempt.attemptId));
    assert.notEqual(
      spawnSync("docker", ["container", "inspect", containerNameForAttempt(secondAttempt.attemptId)]).status,
      0,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

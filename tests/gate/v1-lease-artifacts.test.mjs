import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("../..", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const artifactStoreModule = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);

function cli(...args) {
  const result = spawnSync("pnpm", ["eval", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
  return result;
}

function successfulJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function createRun(databasePath, seed = 7) {
  return successfulJson(cli(
    "run", "create", passingBundle.pathname, "--seed", String(seed), "--db", databasePath,
  ));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

test("GATE-V1.3-001: a live executor owns the global lease, heartbeats, and blocks a second CLI executor", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-lease-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const firstRun = createRun(databasePath, 1);
    const secondRun = createRun(databasePath, 2);
    const { openStateStore, EXECUTION_LEASE_NAME } = await import(storeModule);
    const { NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    let releaseAgent;
    let markStarted;
    const blocked = new Promise((resolve) => { releaseAgent = resolve; });
    const started = new Promise((resolve) => { markStarted = resolve; });
    let firstExecution;

    try {
      firstExecution = new RunExecutor({
        store,
        leaseHeartbeatMs: 10,
        agent: {
          async run() {
            markStarted();
            await blocked;
            return { agentOutcome: "completed", patch: "" };
          },
        },
        evaluator: new NoopEvaluator(),
      }).execute(firstRun.runId);
      await started;

      const firstHeartbeat = store.leases.find(EXECUTION_LEASE_NAME).heartbeatAt;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const nextHeartbeat = store.leases.find(EXECUTION_LEASE_NAME).heartbeatAt;
      assert.notEqual(nextHeartbeat, firstHeartbeat, "active execution must heartbeat");

      const refused = cli("run", "execute", secondRun.runId, "--db", databasePath);
      assert.notEqual(refused.status, 0);
      assert.equal(JSON.parse(refused.stdout).code, "EXECUTOR_LEASE_HELD");
      assert.equal(store.runs.find(secondRun.runId).status, "PREFLIGHT");

      releaseAgent();
      assert.equal((await firstExecution).status, "COMPLETED");
      assert.equal(store.leases.find(EXECUTION_LEASE_NAME), undefined, "lease must release");
    } finally {
      releaseAgent?.();
      await firstExecution?.catch(() => {});
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-002: a dead PID lease is taken over without weakening PID reuse protection", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-stale-lease-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { openStateStore, currentProcessOwner, EXECUTION_LEASE_NAME } = await import(storeModule);
    const store = openStateStore(databasePath);
    try {
      store.leases.acquire(EXECUTION_LEASE_NAME, {
        ownerUuid: "dead-owner",
        ownerPid: 2_147_483_647,
        ownerPidStartedAt: "1970-01-01T00:00:00.000Z",
      });
      const liveOwner = currentProcessOwner();
      const acquired = store.leases.acquire(EXECUTION_LEASE_NAME, liveOwner);
      assert.equal(acquired.ownerUuid, liveOwner.ownerUuid);
      assert.equal(acquired.ownerPid, process.pid);
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-003: no-op execution finalizes checksum-bound artifacts, manifest, and canonical Result", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-artifacts-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const created = createRun(databasePath);
    assert.equal(successfulJson(cli("run", "execute", created.runId, "--db", databasePath)).status, "COMPLETED");
    const shown = successfulJson(cli("run", "show", created.runId, "--db", databasePath));
    const attempt = shown.attempts[0];
    const attemptDirectory = join(directory, created.runId, "attempts", String(attempt.ordinal));
    const manifestBytes = readFileSync(join(attemptDirectory, "manifest.json"));
    const manifest = JSON.parse(manifestBytes);

    assert.equal(shown.artifacts.length, 2);
    assert.ok(shown.artifacts.every(({ status }) => status === "finalized"));
    assert.deepEqual(
      shown.artifacts.map(({ relativePath }) => relativePath).sort(),
      ["agent-events.jsonl", "evaluator-results/noop.json"],
    );
    assert.equal(shown.manifests[0].manifestChecksum, sha256(manifestBytes));
    assert.equal(manifest.entries.length, 2);
    for (const entry of manifest.entries) {
      const bytes = readFileSync(join(attemptDirectory, entry.path));
      assert.equal(entry.sha256, sha256(bytes));
      assert.equal(entry.sizeBytes, bytes.length);
    }

    const resultBytes = readFileSync(join(directory, created.runId, "result.json"));
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const result = database.prepare(
      "SELECT result_json, result_checksum FROM results WHERE run_id = ?",
    ).get(created.runId);
    database.close();
    assert.equal(result.result_checksum, sha256(resultBytes));
    assert.deepEqual(resultBytes, Buffer.from(result.result_json));
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-004: doctor quarantines a crash before manifest publication", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-pre-manifest-crash-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { ArtifactStoreFs } = await import(artifactStoreModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const artifacts = new ArtifactStoreFs({
        runsRoot: directory,
        store,
        onCommitStep(step) {
          if (step === "beforeManifest") throw new Error("SIMULATED_KILL_BEFORE_MANIFEST");
        },
      });
      await assert.rejects(
        () => new RunExecutor({
          store,
          artifacts,
          agent: new NoopAgent(),
          evaluator: new NoopEvaluator(),
        }).execute(runId),
        /SIMULATED_KILL_BEFORE_MANIFEST/,
      );
    } finally {
      store.close();
    }

    const doctor = successfulJson(cli("run", "doctor", runId, "--db", databasePath));
    assert.equal(doctor.status, "ATTEMPT_ACTIVE");
    assert.equal(doctor.healthy, false);
    assert.equal(doctor.quarantined.length, 1);
    assert.ok(doctor.issues.some(({ code }) => code === "PARTIAL_STAGING_QUARANTINED"));
    assert.equal(existsSync(join(directory, runId, ".tmp")), false);
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-005: doctor reports a published manifest missing its SQLite record", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-post-manifest-crash-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { ArtifactStoreFs } = await import(artifactStoreModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const artifacts = new ArtifactStoreFs({
        runsRoot: directory,
        store,
        onCommitStep(step) {
          if (step === "afterRenameBeforeRecord") {
            throw new Error("SIMULATED_KILL_AFTER_MANIFEST");
          }
        },
      });
      await assert.rejects(
        () => new RunExecutor({
          store,
          artifacts,
          agent: new NoopAgent(),
          evaluator: new NoopEvaluator(),
        }).execute(runId),
        /SIMULATED_KILL_AFTER_MANIFEST/,
      );
    } finally {
      store.close();
    }

    const doctor = successfulJson(cli("run", "doctor", runId, "--db", databasePath));
    assert.equal(doctor.status, "ATTEMPT_ACTIVE");
    assert.equal(doctor.healthy, false);
    assert.ok(doctor.issues.some(({ code }) => code === "UNRECORDED_MANIFEST"));
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-006: doctor regenerates corrupt and deleted result.json byte-identically", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-result-repair-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    successfulJson(cli("run", "execute", runId, "--db", databasePath));
    const resultPath = join(directory, runId, "result.json");
    const canonical = readFileSync(resultPath);

    writeFileSync(resultPath, "corrupt");
    const repairedCorrupt = successfulJson(cli("run", "doctor", runId, "--db", databasePath));
    assert.equal(repairedCorrupt.repaired.resultJson, true);
    assert.deepEqual(readFileSync(resultPath), canonical);

    unlinkSync(resultPath);
    const repairedDeleted = successfulJson(cli("run", "doctor", runId, "--db", databasePath));
    assert.equal(repairedDeleted.repaired.resultJson, true);
    assert.equal(repairedDeleted.healthy, true);
    assert.deepEqual(readFileSync(resultPath), canonical);
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.3-007: artifact staging rejects parent traversal and symlink entries", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-unsafe-artifact-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { openStateStore } = await import(storeModule);
    const { ArtifactStoreFs } = await import(artifactStoreModule);
    const store = openStateStore(databasePath);
    try {
      const artifacts = new ArtifactStoreFs({ runsRoot: directory, store });
      const common = {
        runId: "unsafe-run",
        attemptId: "unsafe-attempt",
        ordinal: 1,
        logicalType: "test",
        mime: "text/plain",
        audience: "maintainer_only",
        content: "unsafe",
      };
      assert.throws(
        () => artifacts.stage({ ...common, relativePath: "../escape.txt" }),
        (error) => error?.code === "UNSAFE_ARTIFACT_PATH",
      );

      artifacts.stage({ ...common, relativePath: "safe.txt", content: "safe" });
      const staging = join(directory, "unsafe-run", ".tmp", "unsafe-attempt");
      symlinkSync(directory, join(staging, "link"));
      assert.throws(
        () => artifacts.stage({ ...common, relativePath: "link/escape.txt" }),
        (error) => error?.code === "UNSAFE_ARTIFACT_PATH",
      );
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

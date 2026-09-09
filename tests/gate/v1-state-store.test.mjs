import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("../..", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);

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

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

test("GATE-V1.1-001: migrates a fresh database and reopens idempotently", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-state-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { openStateStore } = await import(storeModule);
    openStateStore(databasePath).close();

    const database = new DatabaseSync(databasePath);
    const first = database.prepare(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    ).all();
    database.close();

    assert.deepEqual(first.map(({ version }) => version), [1, 2, 3, 4, 5, 6, 7]);
    assert.match(first[0].checksum, /^sha256:[a-f0-9]{64}$/);

    openStateStore(databasePath).close();
    const reopened = new DatabaseSync(databasePath);
    assert.deepEqual(
      reopened.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all(),
      first,
    );
    reopened.close();
    assert.deepEqual(readdirSync(directory), ["eval.sqlite"]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.1-002: backs up an existing database before its first migration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-backup-"));
  const databasePath = join(directory, "existing.sqlite");

  try {
    new DatabaseSync(databasePath).close();
    const { openStateStore } = await import(storeModule);
    openStateStore(databasePath).close();

    const backups = readdirSync(directory).filter((name) => (
      name.startsWith("existing.sqlite.") && name.endsWith(".bak")
    ));
    assert.equal(backups.length, 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.1-003: refuses an unknown newer migration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-newer-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES (999, '2026-01-01T00:00:00.000Z', 'sha256:unknown');
    `);
    database.close();

    const { openStateStore } = await import(storeModule);
    assert.throws(
      () => openStateStore(databasePath),
      (error) => error?.code === "MIGRATION_UNKNOWN_NEWER",
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.1-004: creates immutable Run instances and repairs derived input", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-run-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const first = successfulJson(cli(
      "run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath,
    ));
    const second = successfulJson(cli(
      "run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath,
    ));

    assert.deepEqual(Object.keys(first).sort(), ["inputHash", "runId", "status"]);
    assert.match(first.runId, /^[0-9a-f-]{36}$/);
    assert.match(first.inputHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(first.status, "PREFLIGHT");
    assert.notEqual(second.runId, first.runId, "Runs are instances, not input upserts");
    assert.equal(second.inputHash, first.inputHash);

    const shown = successfulJson(cli("run", "show", first.runId, "--db", databasePath));
    assert.equal(shown.run.runId, first.runId);
    assert.equal(shown.run.status, "PREFLIGHT");
    assert.deepEqual(shown.transitions, [{
      runId: first.runId,
      seq: 1,
      fromState: "CREATED",
      toState: "PREFLIGHT",
      reason: "preflight passed",
      at: shown.transitions[0].at,
    }]);

    const inputPath = join(directory, first.runId, "input.json");
    const original = readFileSync(inputPath);
    assert.equal(shown.run.inputJsonChecksum, sha256(original));
    assert.deepEqual(JSON.parse(original), JSON.parse(shown.run.resolvedInputJson));

    unlinkSync(inputPath);
    successfulJson(cli(
      "run", "show", "--repair", first.runId, "--db", databasePath,
    ));
    assert.deepEqual(readFileSync(inputPath), original);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.1-005: preflight rejection creates no database or Run", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-rejected-"));
  const databasePath = join(directory, "eval.sqlite");
  const invalidBundle = new URL("../fixtures/preflight/invalid-task", import.meta.url);

  try {
    const result = cli(
      "run", "create", invalidBundle.pathname, "--seed", "7", "--db", databasePath,
    );
    assert.notEqual(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      preflight: "rejected",
      codes: [{
        code: "schema.additional_property",
        location: "/unexpected",
        message: "Unknown property unexpected",
        file: "task.yaml",
      }],
    });
    assert.equal(existsSync(databasePath), false);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.1-006: rejects a changed checksum for an existing Task version", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-task-version-"));
  const databasePath = join(directory, "eval.sqlite");
  const bundle = join(directory, "bundle");

  try {
    cpSync(passingBundle, bundle, { recursive: true });
    successfulJson(cli("run", "create", bundle, "--seed", "1", "--db", databasePath));
    writeFileSync(join(bundle, "changed.txt"), "same version, different bytes\n");

    const rejected = cli("run", "create", bundle, "--seed", "2", "--db", databasePath);
    assert.notEqual(rejected.status, 0);
    assert.equal(JSON.parse(rejected.stdout).code, "TASK_VERSION_CHECKSUM_MISMATCH");

    const database = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM runs").get().count, 1);
    database.close();
  } finally {
    rmSync(directory, { recursive: true });
  }
});

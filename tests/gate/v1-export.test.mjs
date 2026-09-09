import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("../..", import.meta.url);
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

function createRun(databasePath, seed = 7) {
  return successfulJson(cli(
    "run", "create", passingBundle.pathname, "--seed", String(seed), "--db", databasePath,
  ));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function treeBytes(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => entry.isDirectory()
      ? treeBytes(join(directory, entry.name))
      : [readFileSync(join(directory, entry.name))]);
}

test("GATE-V1.4-001: requester export is schema-valid, checksum-bound, audited, and private-free", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-export-"));
  const databasePath = join(directory, "eval.sqlite");
  const privateMarker = "PRIVATE_EVALUATOR_MARKER_DO_NOT_EXPORT";

  try {
    const { runId } = createRun(databasePath);
    successfulJson(cli("run", "execute", runId, "--db", databasePath));
    const shown = successfulJson(cli("run", "show", runId, "--db", databasePath));
    const attempt = shown.attempts[0];
    const privatePath = join(
      directory,
      runId,
      "attempts",
      String(attempt.ordinal),
      "evaluator-results",
      "private-marker.txt",
    );
    writeFileSync(privatePath, privateMarker);

    const database = new DatabaseSync(databasePath);
    database.prepare(`
      INSERT INTO artifacts (
        attempt_id, logical_type, mime, relative_path, checksum,
        size, status, audience, created_at
      ) VALUES (?, 'private_test_marker', 'text/plain', ?, ?, ?, 'finalized', 'maintainer_only', ?)
    `).run(
      attempt.attemptId,
      "evaluator-results/private-marker.txt",
      sha256(privateMarker),
      Buffer.byteLength(privateMarker),
      new Date().toISOString(),
    );
    database.close();

    const exported = successfulJson(cli(
      "run", "export", "--audience", "requester", runId, "--db", databasePath,
    ));
    assert.equal(exported.outcome, "passed");
    assert.ok(exported.exportId);
    assert.ok(exported.publicResultChecksum);

    const exportDirectory = join(directory, runId, "exports", "requester");
    const resultPath = join(exportDirectory, "result.json");
    const manifestPath = join(exportDirectory, "manifest.json");
    assert.equal(existsSync(resultPath), true);
    assert.equal(existsSync(manifestPath), true);
    assert.equal(successfulJson(cli("validate", resultPath)).kind, "requester-export-result");
    assert.equal(successfulJson(cli("validate", manifestPath)).kind, "export-manifest");

    const publicResult = JSON.parse(readFileSync(resultPath, "utf8"));
    assert.equal(publicResult.publicOutcomeCode, "SOLVED");
    assert.equal("evidenceRefs" in publicResult, false);
    assert.equal("failures" in publicResult, false);
    assert.equal("artifacts" in publicResult, false);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const entry of manifest.entries) {
      const bytes = readFileSync(join(exportDirectory, entry.path));
      assert.equal(entry.sha256, sha256(bytes));
      assert.equal(entry.sizeBytes, bytes.length);
      assert.equal(entry.audience, "requester_safe");
    }

    const auditDatabase = new DatabaseSync(databasePath, { readOnly: true });
    const migrations = auditDatabase.prepare(
      "SELECT version FROM schema_migrations ORDER BY version",
    ).all().map(({ version }) => version);
    const audit = auditDatabase.prepare(
      "SELECT * FROM exports WHERE export_id = ?",
    ).get(exported.exportId);
    auditDatabase.close();
    assert.deepEqual(migrations, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(audit.outcome, "passed");
    assert.equal(audit.failure_code, null);
    assert.equal(audit.public_result_checksum, sha256(readFileSync(resultPath)));
    assert.equal(audit.manifest_hash, sha256(readFileSync(manifestPath)));

    const exportedBytes = Buffer.concat(treeBytes(exportDirectory)).toString("utf8");
    assert.equal(exportedBytes.includes(privateMarker), false);
    assert.equal(exportedBytes.includes("maintainer_only"), false);
    assert.equal(exportedBytes.includes("evaluator-results/private-marker.txt"), false);
    assert.equal(exportedBytes.includes("NOOP_EVALUATION_PASSED"), false);
    assert.equal(exportedBytes.includes("producerRef"), false);
    assert.equal(exportedBytes.includes("evidenceRefs"), false);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.4-002: a non-completed Run is denied without files or a Run transition", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-export-incomplete-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const denied = cli(
      "run", "export", "--audience", "requester", runId, "--db", databasePath,
    );
    assert.notEqual(denied.status, 0);
    const output = JSON.parse(denied.stdout);
    assert.equal(output.outcome, "EXPORT_POLICY_DENIED");
    assert.equal(output.code, "EXPORT_RUN_NOT_COMPLETED");
    assert.equal(existsSync(join(directory, runId, "exports", "requester")), false);

    const shown = successfulJson(cli("run", "show", runId, "--db", databasePath));
    assert.equal(shown.run.status, "PREFLIGHT");
    assert.equal(shown.transitions.at(-1).toState, "PREFLIGHT");

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const audit = database.prepare("SELECT * FROM exports WHERE export_id = ?").get(output.exportId);
    database.close();
    assert.equal(audit.outcome, "EXPORT_POLICY_DENIED");
    assert.equal(audit.failure_code, "EXPORT_RUN_NOT_COMPLETED");
    assert.equal(audit.public_result_checksum, null);
    assert.equal(audit.manifest_hash, null);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.4-003: credential denial is audited and a fixed re-export gets a new export id", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-export-credential-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    successfulJson(cli("run", "execute", runId, "--db", databasePath));
    const shown = successfulJson(cli("run", "show", runId, "--db", databasePath));
    const attempt = shown.attempts[0];
    const eventsPath = join(
      directory,
      runId,
      "attempts",
      String(attempt.ordinal),
      "agent-events.jsonl",
    );
    const originalEvents = readFileSync(eventsPath);
    writeFileSync(eventsPath, `${originalEvents.toString("utf8")}AKIA1234567890ABCDEF\n`);

    const denied = cli(
      "run", "export", "--audience", "requester", runId, "--db", databasePath,
    );
    assert.notEqual(denied.status, 0);
    const denial = JSON.parse(denied.stdout);
    assert.equal(denial.outcome, "EXPORT_POLICY_DENIED");
    assert.equal(denial.code, "DATA_SCAN_CREDENTIAL_DETECTED");
    assert.equal(existsSync(join(directory, runId, "exports", "requester")), false);

    let database = new DatabaseSync(databasePath, { readOnly: true });
    const deniedAudit = database.prepare(
      "SELECT outcome, failure_code FROM exports WHERE export_id = ?",
    ).get(denial.exportId);
    assert.equal(database.prepare("SELECT status FROM runs WHERE run_id = ?").get(runId).status, "COMPLETED");
    database.close();
    assert.equal(deniedAudit.outcome, "EXPORT_POLICY_DENIED");
    assert.equal(deniedAudit.failure_code, "DATA_SCAN_CREDENTIAL_DETECTED");

    writeFileSync(eventsPath, originalEvents);
    const exported = successfulJson(cli(
      "run", "export", "--audience", "requester", runId, "--db", databasePath,
    ));
    assert.equal(exported.outcome, "passed");
    assert.notEqual(exported.exportId, denial.exportId);

    database = new DatabaseSync(databasePath, { readOnly: true });
    const audits = database.prepare(
      "SELECT export_id, outcome FROM exports WHERE run_id = ? ORDER BY created_at, export_id",
    ).all(runId);
    database.close();
    assert.equal(audits.length, 2);
    assert.deepEqual(new Set(audits.map(({ outcome }) => outcome)), new Set([
      "EXPORT_POLICY_DENIED",
      "passed",
    ]));
  } finally {
    rmSync(directory, { recursive: true });
  }
});

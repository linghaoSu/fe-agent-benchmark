import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("../..", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const adapters = new URL("../fixtures/adapters/", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const artifactModule = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);

function cli(...args) {
  const result = spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8" });
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

async function executeFixture(databasePath, runId, fixture) {
  const [{ openStateStore }, { ArtifactStoreFs }, coordinator] = await Promise.all([
    import(storeModule),
    import(artifactModule),
    import(coordinatorModule),
  ]);
  const store = openStateStore(databasePath);
  try {
    const artifacts = new ArtifactStoreFs({ runsRoot: join(databasePath, ".."), store });
    const config = JSON.parse(store.runs.find(runId).resolvedInputJson).adapterProtocol;
    const agent = new coordinator.SubprocessAgentPhase({
      store,
      artifacts,
      command: { command: process.execPath, args: [new URL(fixture, adapters).pathname] },
      maxFrameBytes: config.maxFrameBytes,
      heartbeatTimeoutMs: config.heartbeatTimeoutSeconds * 1_000,
      cancelGraceMs: 25,
    });
    const run = await new coordinator.RunExecutor({
      store,
      artifacts,
      agent,
      evaluator: new coordinator.NoopEvaluator(),
    }).execute(runId);
    return {
      run,
      attempt: store.attempts.list(runId)[0],
      frames: store.adapterFrames.forAttempt(store.attempts.list(runId)[0].attemptId),
      producers: store.producers.forRun(runId),
      result: store.results.find(runId),
    };
  } finally {
    store.close();
  }
}

test("GATE-V2.1-001: mock subprocess completes with ordered frames and artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v2-mock-"));
  const databasePath = join(directory, "eval.sqlite");
  try {
    const created = createRun(databasePath, 11);
    const executed = successfulJson(cli(
      "run", "execute", created.runId, "--agent", "mock", "--db", databasePath,
    ));
    assert.equal(executed.status, "COMPLETED");

    const shown = successfulJson(cli("run", "show", created.runId, "--db", databasePath));
    const attempt = shown.attempts[0];
    assert.deepEqual({
      agentOutcome: attempt.agentOutcome,
      executionClassification: attempt.executionClassification,
      failureCode: attempt.failureCode,
    }, { agentOutcome: "completed", executionClassification: "completed", failureCode: null });
    assert.deepEqual(JSON.parse(shown.run.resolvedInputJson).adapterProtocol, {
      maxFrameBytes: 65_536,
      heartbeatTimeoutSeconds: 1,
    });

    for (const direction of ["adapter_to_coordinator", "coordinator_to_adapter"]) {
      const frames = shown.adapterFrames.filter((frame) => frame.direction === direction);
      assert.deepEqual(frames.map(({ seq }) => seq), frames.map((_, index) => index));
    }
    assert.ok(shown.adapterFrames.some(({ type }) => type === "tool_request"));
    assert.ok(shown.adapterFrames.some(({ type }) => type === "tool_result"));

    const relativePaths = shown.artifacts.map(({ relativePath }) => relativePath);
    assert.ok(relativePaths.includes("agent-events.jsonl"));
    assert.ok(relativePaths.includes("patch.diff"));
    assert.ok(relativePaths.includes("adapter.stderr.log"));
    const attemptDirectory = join(directory, created.runId, "attempts", String(attempt.ordinal));
    assert.match(
      readFileSync(join(attemptDirectory, "patch.diff"), "utf8"),
      /preflight-synthetic@1 seed=11/,
    );
    const events = readFileSync(join(attemptDirectory, "agent-events.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse);
    assert.deepEqual(events.filter(({ type }) => type === "event").map(({ payload }) => payload.name), [
      "mock_started",
      "mock_tool_completed",
    ]);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const sideEffectOrder = database.prepare(`
      SELECT rowid, direction, type FROM adapter_frames
      WHERE attempt_id = ? AND type IN ('tool_request', 'tool_result') ORDER BY rowid
    `).all(attempt.attemptId);
    database.close();
    assert.deepEqual(sideEffectOrder.map(({ direction, type }) => ({ direction, type })), [
      { direction: "adapter_to_coordinator", type: "tool_request" },
      { direction: "coordinator_to_adapter", type: "tool_result" },
    ]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

const faultCases = [
  ["malformed.mjs", "PROTOCOL_MALFORMED_FRAME"],
  ["oversized.mjs", "PROTOCOL_FRAME_TOO_LARGE"],
  ["seq-gap.mjs", "PROTOCOL_SEQ_GAP"],
  ["heartbeat-stall.mjs", "PROTOCOL_HEARTBEAT_TIMEOUT"],
  ["crash-mid-run.mjs", "ADAPTER_PROCESS_EXITED"],
  ["wrong-version.mjs", "PROTOCOL_HANDSHAKE_FAILED"],
];

for (const [fixture, code] of faultCases) {
  test(`GATE-V2.1-fault-${code}: ${fixture} is durably classified`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v2-fault-"));
    const databasePath = join(directory, "eval.sqlite");
    try {
      const { runId } = createRun(databasePath);
      const outcome = await executeFixture(databasePath, runId, fixture);
      assert.equal(outcome.run.status, "COMPLETED");
      assert.deepEqual({
        lifecycleStatus: outcome.attempt.lifecycleStatus,
        agentOutcome: outcome.attempt.agentOutcome,
        executionClassification: outcome.attempt.executionClassification,
        failureCode: outcome.attempt.failureCode,
      }, {
        lifecycleStatus: "SUCCEEDED",
        agentOutcome: "adapter_error",
        executionClassification: "agent_failure",
        failureCode: code,
      });
      assert.ok(outcome.producers.some((producer) => (
        producer.kind === "adapter" && producer.privateCode === code
      )));
      assert.equal(JSON.parse(outcome.result.resultJson).solved, false);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
}

test("GATE-V2.1-008: duplicate seq is ignored without terminating the session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-v2-duplicate-"));
  const databasePath = join(directory, "eval.sqlite");
  try {
    const { runId } = createRun(databasePath);
    const outcome = await executeFixture(databasePath, runId, "duplicate-seq.mjs");
    assert.equal(outcome.attempt.agentOutcome, "completed");
    assert.equal(outcome.attempt.failureCode, null);
    const inbound = outcome.frames.filter(({ direction }) => direction === "adapter_to_coordinator");
    assert.deepEqual(inbound.map(({ seq }) => seq), [0, 1, 2, 3]);
    assert.equal(inbound.filter(({ type }) => type === "event").length, 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V1.4-004: exporting a missing Run returns RUN_NOT_FOUND without an audit row", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-export-missing-"));
  const databasePath = join(directory, "eval.sqlite");
  try {
    const result = cli(
      "run", "export", "--audience", "requester", "missing-run", "--db", databasePath,
    );
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).code, "RUN_NOT_FOUND");
    const database = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM exports").get().count, 0);
    database.close();
  } finally {
    rmSync(directory, { recursive: true });
  }
});

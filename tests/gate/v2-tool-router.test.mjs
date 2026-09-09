import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const routerModule = new URL("../../packages/tool-router/dist/index.js", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const artifactModule = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);
const mockAdapter = new URL("../../packages/adapter-mock/dist/index.js", import.meta.url);
const scenarios = new URL("../fixtures/adapters/scenarios/", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);

function cli(...args) {
  return spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8" });
}

function successfulJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function createRun(databasePath) {
  return successfulJson(cli(
    "run", "create", passingBundle.pathname, "--seed", "7", "--db", databasePath,
  ));
}

async function executeScenario(directory, scenario, options = {}) {
  const databasePath = join(directory, "eval.sqlite");
  const { runId } = createRun(databasePath);
  const [{ openStateStore }, { ArtifactStoreFs }, coordinator] = await Promise.all([
    import(storeModule),
    import(artifactModule),
    import(coordinatorModule),
  ]);
  const store = openStateStore(databasePath);
  try {
    const artifacts = new ArtifactStoreFs({ runsRoot: directory, store });
    const runner = options.runnerFactory?.(store, runId);
    const agent = new coordinator.SubprocessAgentPhase({
      store,
      artifacts,
      command: {
        command: process.execPath,
        args: [mockAdapter.pathname, new URL(scenario, scenarios).pathname],
      },
      maxFrameBytes: 65_536,
      heartbeatTimeoutMs: 1_000,
      cancelGraceMs: 25,
      ...(runner ? { runner } : {}),
      ...(options.toolRouter ? { toolRouter: options.toolRouter } : {}),
    });
    const run = await new coordinator.RunExecutor({
      store,
      artifacts,
      agent,
      evaluator: new coordinator.NoopEvaluator(),
    }).execute(runId);
    const [attempt] = store.attempts.list(runId);
    return {
      run,
      attempt,
      frames: store.adapterFrames.forAttempt(attempt.attemptId),
      toolCalls: store.toolCalls.forAttempt(attempt.attemptId),
      producers: store.producers.forRun(runId),
      artifacts: store.artifacts.forRun(runId),
      result: JSON.parse(store.results.find(runId).resultJson),
      databasePath,
      attemptDirectory: join(directory, runId, "attempts", String(attempt.ordinal)),
    };
  } finally {
    store.close();
  }
}

function framePayload(outcome, type) {
  const row = outcome.frames.find((frame) => frame.type === type);
  assert.ok(row, `expected ${type} frame`);
  return JSON.parse(row.frameJson).payload;
}

function treeBytes(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? treeBytes(child) : [readFileSync(child)];
  });
}

test("GATE-V2.2-001: allowed tools execute through the public ToolExecutor seam", async () => {
  const { FakeWorkspaceRunner, ToolExecutor, resolveToolPolicy } = await import(routerModule);
  const rows = [];
  const executor = new ToolExecutor({
    policy: resolveToolPolicy({ writablePaths: ["src/**"], forbiddenPaths: [] }),
    budgets: {
      maxToolCalls: 3,
      maxTotalToolOutputBytes: 1_024,
      maxWallTimeMs: 1_000,
    },
    outputCapBytes: 128,
    runner: new FakeWorkspaceRunner(),
    recorder: {
      accept(record) {
        rows.push({ ...record, status: "accepted" });
      },
      complete(record) {
        Object.assign(rows[0], record, { status: "completed" });
      },
    },
  });

  const result = await executor.execute({
    attemptId: "attempt-1",
    seq: 2,
    tool: "echo",
    arguments: { message: "hello" },
  });

  assert.deepEqual(result, {
    kind: "tool_result",
    status: "succeeded",
    output: { text: "hello" },
  });
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[0].outcomeCode, "TOOL_SUCCEEDED");
});

test("GATE-V2.2-002: policy allows the four fake tools and denies tool/path escapes", async () => {
  const { FakeWorkspaceRunner, ToolExecutor, resolveToolPolicy } = await import(routerModule);
  const rows = new Map();
  const executor = new ToolExecutor({
    policy: resolveToolPolicy({ writablePaths: ["src/**"], forbiddenPaths: ["src/private/**"] }),
    budgets: { maxToolCalls: 10, maxTotalToolOutputBytes: 2_048, maxWallTimeMs: 1_000 },
    outputCapBytes: 1_024,
    runner: new FakeWorkspaceRunner({ "src/input.ts": "input" }),
    recorder: {
      accept(record) { rows.set(record.seq, { ...record, status: "accepted" }); },
      complete(record) { Object.assign(rows.get(record.seq), record, { status: "completed" }); },
    },
  });
  const call = (seq, tool, arguments_) => executor.execute({
    attemptId: "attempt-policy", seq, tool, arguments: arguments_,
  });

  assert.equal((await call(0, "echo", { message: "ok" })).status, "succeeded");
  assert.equal((await call(1, "read_file", { path: "src/input.ts" })).status, "succeeded");
  assert.equal((await call(2, "write_file", { path: "src/output.ts", content: "out" })).status, "succeeded");
  assert.equal((await call(3, "run_command", { command: "build", cwd: "src" })).status, "succeeded");
  for (const [seq, tool, arguments_] of [
    [4, "delete_file", { path: "src/output.ts" }],
    [5, "read_file", { path: "../secret" }],
    [6, "write_file", { path: "/tmp/escape", content: "no" }],
    [7, "read_file", { path: "src/private/secret" }],
  ]) {
    const denied = await call(seq, tool, arguments_);
    assert.deepEqual(
      { status: denied.status, errorCode: denied.errorCode },
      { status: "rejected", errorCode: "TOOL_POLICY_DENIED" },
    );
  }
  const envDenied = await call(8, "run_command", {
    command: "build", config: { dns: "evil.invalid" },
  });
  assert.equal(envDenied.errorCode, "TOOL_ENV_OVERRIDE_DENIED");
  assert.equal([...rows.values()].every(({ status }) => status === "completed"), true);
});

test("GATE-V2.2-003: scripted disallowed and escaping requests are durable denials", async () => {
  for (const scenario of ["disallowed-tool.json", "path-parent.json", "path-absolute.json"]) {
    const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-policy-"));
    try {
      const outcome = await executeScenario(directory, scenario);
      assert.equal(outcome.run.status, "COMPLETED");
      assert.equal(outcome.attempt.agentOutcome, "completed");
      assert.equal(outcome.toolCalls[0].outcomeCode, "TOOL_POLICY_DENIED");
      assert.deepEqual(
        { status: framePayload(outcome, "tool_result").status,
          errorCode: framePayload(outcome, "tool_result").errorCode },
        { status: "rejected", errorCode: "TOOL_POLICY_DENIED" },
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
});

test("GATE-V2.2-004: each budget emits its exact code and uses budget_exhausted lifecycle", async () => {
  const cases = [
    ["budget-tool-calls.json", "BUDGET_EXHAUSTED_TOOL_CALLS", { maxToolCalls: 1 }],
    ["budget-output.json", "BUDGET_EXHAUSTED_OUTPUT", {
      maxTotalToolOutputBytes: 32, outputCapBytes: 1_024,
    }],
    ["budget-wall-time.json", "BUDGET_EXHAUSTED_WALL_TIME", (() => {
      let reads = 0;
      return { maxWallTimeMs: 1_000, startedAtMs: 0, now: () => reads++ < 2 ? 0 : 2_000 };
    })()],
  ];
  for (const [scenario, code, toolRouter] of cases) {
    const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-budget-"));
    try {
      const outcome = await executeScenario(directory, scenario, { toolRouter });
      assert.equal(outcome.run.status, "COMPLETED");
      assert.deepEqual({
        lifecycleStatus: outcome.attempt.lifecycleStatus,
        agentOutcome: outcome.attempt.agentOutcome,
        executionClassification: outcome.attempt.executionClassification,
        failureCode: outcome.attempt.failureCode,
      }, {
        lifecycleStatus: "SUCCEEDED",
        agentOutcome: "budget_exhausted",
        executionClassification: "budget_exhausted",
        failureCode: code,
      });
      assert.equal(outcome.toolCalls.at(-1).outcomeCode, code);
      assert.equal(framePayload(outcome, "budget_update").extensions.code, code);
      assert.ok(outcome.producers.some((producer) => (
        producer.kind === "budget" && producer.privateCode === code
      )));
      assert.equal(outcome.result.efficiency.toolCalls, 1);
      assert.equal(typeof outcome.result.efficiency.toolOutputBytes, "number");
      assert.equal(typeof outcome.result.efficiency.wallTimeSeconds, "number");
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
});

test("GATE-V2.2-004b: wall budget terminates a cooperative heartbeat-only Adapter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-wall-deadline-"));
  try {
    const outcome = await executeScenario(directory, "budget-wall-heartbeat.json", {
      toolRouter: { maxWallTimeMs: 40 },
    });
    assert.equal(outcome.attempt.agentOutcome, "budget_exhausted");
    assert.equal(outcome.attempt.failureCode, "BUDGET_EXHAUSTED_WALL_TIME");
    assert.equal(outcome.toolCalls.length, 0);
    assert.equal(framePayload(outcome, "budget_update").extensions.code, "BUDGET_EXHAUSTED_WALL_TIME");
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V2.2-005: oversized output becomes a maintainer-only Artifact reference", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-truncation-"));
  try {
    const outcome = await executeScenario(directory, "oversized.json", {
      toolRouter: { outputCapBytes: 32, maxTotalToolOutputBytes: 1_024 },
    });
    const row = outcome.toolCalls[0];
    const result = framePayload(outcome, "tool_result").output;
    assert.deepEqual({ truncated: row.truncated, artifactRef: row.artifactRef, outputBytes: row.outputBytes }, {
      truncated: true,
      artifactRef: "tool-output/2.txt",
      outputBytes: 256,
    });
    assert.deepEqual({
      artifactRef: result.artifactRef,
      truncated: result.truncated,
      hasInlineText: "text" in result,
    }, { artifactRef: row.artifactRef, truncated: true, hasInlineText: false });
    assert.match(result.marker, /^\[TRUNCATED:256 bytes;/);
    const artifact = outcome.artifacts.find(({ relativePath }) => relativePath === row.artifactRef);
    assert.equal(artifact.audience, "maintainer_only");
    assert.equal(readFileSync(join(outcome.attemptDirectory, row.artifactRef), "utf8"), "x".repeat(256));
    assert.equal(outcome.result.efficiency.toolCalls, 1);
    assert.equal(outcome.result.efficiency.toolOutputBytes, 256);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V2.2-006: tool output and Adapter stderr are redacted before any persistence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-redaction-"));
  const toolSecret = "toolrouter" + "secret123456";
  const stderrSecret = "adapter" + "stderrsecret123456";
  const eventSecret = "adapter" + "eventsecret123456";
  try {
    const outcome = await executeScenario(directory, "redaction.json");
    const persisted = Buffer.concat([readFileSync(outcome.databasePath), ...treeBytes(join(directory, outcome.run.runId))])
      .toString("utf8");
    assert.equal(persisted.includes(toolSecret), false);
    assert.equal(persisted.includes(stderrSecret), false);
    assert.equal(persisted.includes(eventSecret), false);
    assert.match(persisted, /\[REDACTED:credential\]/);
    assert.match(readFileSync(join(outcome.attemptDirectory, "adapter.stderr.log"), "utf8"), /\[REDACTED:credential\]/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V2.2-007: Adapter host env is allowlisted and network overrides are rejected", async () => {
  const previous = process.env.FRONTEND_AGENT_HOST_ONLY;
  process.env.FRONTEND_AGENT_HOST_ONLY = "must-not-cross";
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-adapter-env-"));
  try {
    const isolated = await executeScenario(directory, "env-allowlist.json");
    const envEvent = isolated.frames.map(({ frameJson }) => JSON.parse(frameJson))
      .find((frame) => frame.type === "event" && frame.payload.name === "mock_env");
    const allowed = new Set([
      "FAB_RUN_ID", "FAB_ATTEMPT_ID", "LANG", "LC_ALL", "TZ", "__CF_USER_TEXT_ENCODING",
    ]);
    assert.equal(
      envEvent.payload.data.keys.every((key) => allowed.has(key)),
      true,
      JSON.stringify(envEvent.payload.data.keys),
    );
    assert.equal(envEvent.payload.data.keys.includes("FRONTEND_AGENT_HOST_ONLY"), false);

    const overrideDirectory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-env-denial-"));
    try {
      const denied = await executeScenario(overrideDirectory, "env-override.json");
      assert.equal(denied.toolCalls[0].outcomeCode, "TOOL_ENV_OVERRIDE_DENIED");
      assert.equal(framePayload(denied, "tool_result").errorCode, "TOOL_ENV_OVERRIDE_DENIED");
      assert.equal(denied.attempt.agentOutcome, "completed");
    } finally {
      rmSync(overrideDirectory, { recursive: true });
    }
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_AGENT_HOST_ONLY;
    else process.env.FRONTEND_AGENT_HOST_ONLY = previous;
    rmSync(directory, { recursive: true });
  }
});

test("GATE-V2.2-008: tool_request and accepted tool_call rows exist before runner execution", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-tool-order-"));
  try {
    const outcome = await executeScenario(directory, "allowed.json", {
      runnerFactory: (store, runId) => ({
        run() {
          const [attempt] = store.attempts.list(runId);
          assert.equal(store.toolCalls.forAttempt(attempt.attemptId)[0].status, "accepted");
          assert.ok(store.adapterFrames.forAttempt(attempt.attemptId)
            .some(({ type }) => type === "tool_request"));
          return "ordered";
        },
      }),
    });
    assert.equal(outcome.toolCalls[0].status, "completed");
    assert.equal(outcome.toolCalls[0].outcomeCode, "TOOL_SUCCEEDED");
  } finally {
    rmSync(directory, { recursive: true });
  }
});

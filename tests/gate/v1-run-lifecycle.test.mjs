import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);
const passingBundle = new URL("../fixtures/preflight/passing", import.meta.url);
const storeModule = new URL("../../packages/state-store-sqlite/dist/index.js", import.meta.url);
const coordinatorModule = new URL("../../packages/run-coordinator/dist/index.js", import.meta.url);

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

function transitionPairs(transitions) {
  return transitions.map(({ fromState, toState }) => `${fromState}->${toState}`);
}

test("GATE-V1.2-001: no-op CLI executes the complete ordered lifecycle", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-lifecycle-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const created = createRun(databasePath);
    const executed = successfulJson(cli("run", "execute", created.runId, "--db", databasePath));
    assert.deepEqual(executed, { runId: created.runId, status: "COMPLETED" });

    const shown = successfulJson(cli("run", "show", created.runId, "--db", databasePath));
    assert.equal(shown.run.status, "COMPLETED");
    assert.deepEqual(transitionPairs(shown.transitions), [
      "CREATED->PREFLIGHT",
      "PREFLIGHT->ATTEMPT_ACTIVE",
      "ATTEMPT_ACTIVE->AGGREGATING",
      "AGGREGATING->COMPLETED",
    ]);
    assert.equal(shown.attempts.length, 1);
    assert.deepEqual({
      ordinal: shown.attempts[0].ordinal,
      lifecycleStatus: shown.attempts[0].lifecycleStatus,
      agentOutcome: shown.attempts[0].agentOutcome,
      executionClassification: shown.attempts[0].executionClassification,
      failureCode: shown.attempts[0].failureCode,
    }, {
      ordinal: 1,
      lifecycleStatus: "SUCCEEDED",
      agentOutcome: "completed",
      executionClassification: "completed",
      failureCode: null,
    });
    assert.deepEqual(transitionPairs(shown.attemptTransitions), [
      "CREATED->SANDBOX_STARTING",
      "SANDBOX_STARTING->AGENT_RUNNING",
      "AGENT_RUNNING->AGENT_STOPPING",
      "AGENT_STOPPING->WORKSPACE_FROZEN",
      "WORKSPACE_FROZEN->EVALUATING",
      "EVALUATING->FINALIZING",
      "FINALIZING->SUCCEEDED",
    ]);
    assert.deepEqual(
      shown.producerRecords.map(({ kind, privateCode }) => ({ kind, privateCode })),
      [{ kind: "evaluator", privateCode: "NOOP_EVALUATION_PASSED" }],
    );
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.2-002: Agent fault fakes cross the evaluation barrier with orthogonal classifications", async () => {
  const { openStateStore } = await import(storeModule);
  const {
    BudgetExhaustedAgent,
    CancelledAgent,
    FailingAgent,
    NoopEvaluator,
    RunExecutor,
  } = await import(coordinatorModule);
  const cases = [
    {
      Agent: FailingAgent,
      agentOutcome: "adapter_error",
      executionClassification: "agent_failure",
      failureCode: "ADAPTER_ERROR",
      producerKind: "adapter",
    },
    {
      Agent: BudgetExhaustedAgent,
      agentOutcome: "budget_exhausted",
      executionClassification: "budget_exhausted",
      failureCode: "BUDGET_EXHAUSTED",
      producerKind: "budget",
    },
    {
      Agent: CancelledAgent,
      agentOutcome: "cancelled",
      executionClassification: "agent_failure",
      failureCode: "AGENT_CANCELLED",
      producerKind: "adapter",
    },
  ];

  for (const expected of cases) {
    const directory = mkdtempSync(join(tmpdir(), "frontend-agent-agent-fault-"));
    const databasePath = join(directory, "eval.sqlite");
    try {
      const { runId } = createRun(databasePath);
      const store = openStateStore(databasePath);
      try {
        const executor = new RunExecutor({
          store,
          agent: new expected.Agent(),
          evaluator: new NoopEvaluator(),
        });
        const run = await executor.execute(runId);
        const [attempt] = store.attempts.list(runId);
        const producer = store.producers.forRun(runId)
          .find(({ privateCode }) => privateCode === expected.failureCode);

        assert.equal(run.status, "COMPLETED");
        assert.deepEqual({
          lifecycleStatus: attempt.lifecycleStatus,
          agentOutcome: attempt.agentOutcome,
          executionClassification: attempt.executionClassification,
          failureCode: attempt.failureCode,
        }, {
          lifecycleStatus: "SUCCEEDED",
          agentOutcome: expected.agentOutcome,
          executionClassification: expected.executionClassification,
          failureCode: expected.failureCode,
        });
        assert.deepEqual(
          { kind: producer?.kind, privateCode: producer?.privateCode },
          { kind: expected.producerKind, privateCode: expected.failureCode },
        );
        assert.ok(transitionPairs(store.attempts.transitions(attempt.attemptId))
          .includes("WORKSPACE_FROZEN->EVALUATING"));
      } finally {
        store.close();
      }
    } finally {
      removeTree(directory);
    }
  }
});

test("GATE-V1.2-003: evaluator crashes are evaluator errors, not Agent failures", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-evaluator-fault-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { CrashingEvaluator, NoopAgent, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const run = await new RunExecutor({
        store,
        agent: new NoopAgent(),
        evaluator: new CrashingEvaluator(),
      }).execute(runId);
      const [attempt] = store.attempts.list(runId);
      const producer = store.producers.forRun(runId)[0];

      assert.equal(run.status, "FAILED");
      assert.deepEqual({
        lifecycleStatus: attempt.lifecycleStatus,
        agentOutcome: attempt.agentOutcome,
        executionClassification: attempt.executionClassification,
        failureCode: attempt.failureCode,
      }, {
        lifecycleStatus: "FAILED",
        agentOutcome: "completed",
        executionClassification: "evaluator_error",
        failureCode: "EVALUATOR_CRASH",
      });
      assert.deepEqual(
        { kind: producer.kind, privateCode: producer.privateCode },
        { kind: "evaluator", privateCode: "EVALUATOR_CRASH" },
      );
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.2-004: startup infrastructure failure retries once and refuses a third Attempt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-infrastructure-fault-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const {
      InfrastructureFailure,
      NoopAgent,
      NoopEvaluator,
      RunExecutor,
    } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const run = await new RunExecutor({
        store,
        agent: new NoopAgent(),
        evaluator: new NoopEvaluator(),
        sandboxStarting: new InfrastructureFailure(),
      }).execute(runId);
      const attempts = store.attempts.list(runId);
      const producers = store.producers.forRun(runId);

      assert.equal(run.status, "FAILED");
      assert.deepEqual(attempts.map((attempt) => ({
        ordinal: attempt.ordinal,
        lifecycleStatus: attempt.lifecycleStatus,
        agentOutcome: attempt.agentOutcome,
        executionClassification: attempt.executionClassification,
        failureCode: attempt.failureCode,
      })), [1, 2].map((ordinal) => ({
        ordinal,
        lifecycleStatus: "FAILED",
        agentOutcome: "not_started",
        executionClassification: "infrastructure_error",
        failureCode: "SANDBOX_START_FAILED",
      })));
      assert.deepEqual(
        producers.map(({ kind, privateCode }) => ({ kind, privateCode })),
        [1, 2].map(() => ({ kind: "infrastructure", privateCode: "SANDBOX_START_FAILED" })),
      );
      assert.equal(
        transitionPairs(store.runs.transitions(runId))
          .filter((transition) => transition === "ATTEMPT_ACTIVE->ATTEMPT_ACTIVE").length,
        1,
      );
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.2-005: illegal execution transitions reject without changing durable state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-illegal-transition-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const executor = new RunExecutor({
        store,
        agent: new NoopAgent(),
        evaluator: new NoopEvaluator(),
      });
      await executor.execute(runId);
      const before = JSON.stringify({
        run: store.runs.find(runId),
        runTransitions: store.runs.transitions(runId),
        attempts: store.attempts.list(runId),
      });

      await assert.rejects(
        () => executor.execute(runId),
        (error) => error?.code === "ILLEGAL_RUN_TRANSITION",
      );
      assert.equal(JSON.stringify({
        run: store.runs.find(runId),
        runTransitions: store.runs.transitions(runId),
        attempts: store.attempts.list(runId),
      }), before);
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.2-006: agent outcome is write-once", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-agent-outcome-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const executor = new RunExecutor({
        store,
        agent: new NoopAgent(),
        evaluator: new NoopEvaluator(),
      });
      await executor.execute(runId);
      const [attempt] = store.attempts.list(runId);

      assert.throws(
        () => executor.setAgentOutcome(attempt.attemptId, "adapter_error"),
        (error) => error?.code === "AGENT_OUTCOME_IMMUTABLE",
      );
      assert.equal(store.attempts.find(attempt.attemptId).agentOutcome, "completed");
    } finally {
      store.close();
    }
  } finally {
    removeTree(directory);
  }
});

test("GATE-V1.2-007: an interruption after a committed transition remains visible and resumable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-interrupted-"));
  const databasePath = join(directory, "eval.sqlite");

  try {
    const { runId } = createRun(databasePath);
    const { openStateStore } = await import(storeModule);
    const { NoopAgent, NoopEvaluator, RunExecutor } = await import(coordinatorModule);
    const store = openStateStore(databasePath);
    try {
      const executor = new RunExecutor({
        store,
        agent: new NoopAgent(),
        evaluator: new NoopEvaluator(),
        onTransitionCommitted(transition) {
          if (transition.scope === "attempt" && transition.toState === "WORKSPACE_FROZEN") {
            throw new Error("SIMULATED_INTERRUPT");
          }
        },
      });
      await assert.rejects(() => executor.execute(runId), /SIMULATED_INTERRUPT/);
    } finally {
      store.close();
    }

    const shown = successfulJson(cli("run", "show", runId, "--db", databasePath));
    assert.equal(shown.run.status, "ATTEMPT_ACTIVE");
    assert.equal(shown.attempts[0].lifecycleStatus, "WORKSPACE_FROZEN");
    assert.equal(shown.attempts[0].agentOutcome, "completed");
    assert.ok(!shown.transitions.some(({ toState }) => toState === "COMPLETED"));
    assert.ok(!shown.attemptTransitions.some(({ toState }) => toState === "EVALUATING"));
  } finally {
    removeTree(directory);
  }
});

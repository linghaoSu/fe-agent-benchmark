import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const comparison = new URL("../../packages/comparison/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const repoRoot = new URL("../..", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url).pathname;
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 1_500_000, maxBuffer: 64 * 1024 * 1024 });

const result = (over = {}) => ({
  schemaVersion: 1, runId: "run", attemptId: "attempt", evaluatedSnapshotDigest: "sha256:x", task: { id: "t", version: 1 },
  valid: true, solved: true, evidenceRefs: { valid: ["a"], solved: ["a"] },
  scores: Object.fromEntries(["build", "functional", "visual", "responsive", "accessibility", "engineering"].map((n) => [n, { value: 1, evidenceRefs: ["a"] }])),
  efficiency: { inputTokens: 0, outputTokens: 0, toolCalls: 3, toolOutputBytes: 10, wallTimeSeconds: 10, costUsd: 0.5 },
  extensions: { executionClassification: "completed", gates: { integrity: "passed", build: "passed", criticalFunctionalTests: "passed" } },
  ...over,
});
const run = (runId, seed, over = {}) => ({ runId, seed, status: "COMPLETED", result: result(), finalClassification: "completed", attempts: 1, ...over });

test("GATE-V6.1-001: success@k, any/all, infrastructure rates and means over independent Runs", async () => {
  const { summarizeConfiguration } = await import(comparison);
  const unsolved = result({ solved: false, scores: { ...result().scores, functional: { value: 0.4, evidenceRefs: ["a"] } }, efficiency: { ...result().efficiency, wallTimeSeconds: 30, costUsd: 1.5 } });
  const config = { configurationId: "a", runs: [
    run("r1", 1), run("r2", 2, { result: unsolved }),
    run("r3", 3, { attempts: 2 }), // one infrastructure retry that recovered
    run("r4", 4, { status: "FAILED", result: undefined, finalClassification: "infrastructure_error", attempts: 2 }),
  ] };
  const summary = summarizeConfiguration(config);
  assert.equal(summary.requestedK, 4); assert.equal(summary.successAtK, 2); assert.equal(summary.anyAtK, true); assert.equal(summary.allAtK, false);
  assert.equal(summary.rawInfrastructureRate, 0.5); // Runs whose first Attempt hit infrastructure: r3 (retried) and r4 → 2/4
  assert.equal(summary.finalInfrastructureRate, 0.25);
  // A FAILED Run carrying a Result is never a success; an undersized window can never be all@k.
  const failedWithResult = summarizeConfiguration({ configurationId: "x", runs: [run("f", 1, { status: "FAILED", finalClassification: "evaluator_error" })] });
  assert.equal(failedWithResult.successAtK, 0);
  const undersized = summarizeConfiguration({ configurationId: "y", runs: [run("u", 1)] }, 5);
  assert.deepEqual([undersized.requestedK, undersized.successAtK, undersized.allAtK], [5, 1, false]);
  assert.equal(summary.meanScores.functional, 0.8); assert.equal(summary.meanCostUsd, 0.833333); assert.equal(summary.meanWallTimeSeconds, 16.666667);
  const k2 = summarizeConfiguration(config, 2);
  assert.equal(k2.requestedK, 2); assert.equal(k2.successAtK, 1); assert.equal(k2.rawInfrastructureRate, 0);
  assert.throws(() => summarizeConfiguration(config, 0), RangeError);
});

test("GATE-V6.1-002: comparison report validates and records stability + seeds", async () => {
  const { buildComparisonReport, stabilityOf } = await import(comparison);
  const { validateContractDocument } = await import(contracts);
  const stable = { configurationId: "stable", runs: [run("s1", 1), run("s2", 2), run("s3", 3)] };
  const flaky = { configurationId: "flaky", runs: [run("f1", 1), run("f2", 2, { result: result({ solved: false }) }), run("f3", 3)] };
  assert.deepEqual(stabilityOf(stable), { agreement: 1, distinctConclusions: 1 });
  assert.deepEqual(stabilityOf(flaky), { agreement: 0.666667, distinctConclusions: 2 });
  const report = buildComparisonReport({ comparisonReportId: "cmp", createdAt: "2026-01-01T00:00:00Z", configurations: [stable, flaky], k: 3 });
  const validation = validateContractDocument(report, "comparison-report");
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.deepEqual(report.configurations.map((c) => c.runIds.length), [3, 3]);
  assert.deepEqual(report.extensions.seeds, { stable: [1, 2, 3], flaky: [1, 2, 3] });
});

test("GATE-V6.1-Docker: batch two seeds each of gold and noop, then compare", { skip: unavailable, timeout: 1_500_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "fab-v6-compare-"));
  const db = join(root, "eval.sqlite");
  try {
    const gold = JSON.parse(cli("batch", task, "--seeds", "1,2", "--scenario", "reference:gold", "--configuration", "gold", "--db", db).stdout);
    const noop = JSON.parse(cli("batch", task, "--seeds", "1,2", "--scenario", "react-orders-noop", "--configuration", "noop", "--db", db).stdout);
    assert.deepEqual(gold.runs.map((r) => r.status), ["COMPLETED", "COMPLETED"]);
    const out = join(root, "report.json");
    const compare = cli("compare", "--config", `gold=${gold.runs.map((r) => r.runId).join(",")}`, "--config", `noop=${noop.runs.map((r) => r.runId).join(",")}`, "--k", "2", "--out", out, "--db", db);
    assert.equal(compare.status, 0, compare.stderr || compare.stdout);
    const report = JSON.parse(readFileSync(out, "utf8"));
    const byId = Object.fromEntries(report.comparisons.map((c) => [c.configurationId, c]));
    assert.deepEqual([byId.gold.successAtK, byId.gold.allAtK, byId.noop.successAtK, byId.noop.anyAtK], [2, true, 0, false]);
    assert.equal(byId.gold.meanScores.functional, 1); assert.ok(byId.noop.meanScores.functional < 1);
    assert.deepEqual(report.extensions.stability.gold, { agreement: 1, distinctConclusions: 1 });
  } finally { removeTree(root); }
});

test("GATE-V6.2-001: suite publication requires a checksum-bound passing calibration and rejects overlap, leaks and republish drift", () => {
  const root = mkdtempSync(join(tmpdir(), "fab-suite-"));
  const reports = join(root, "reports"); mkdirSync(reports);
  const checksum = JSON.parse(cli("checksum", task).stdout).bundleChecksum;
  const writeReport = (over = {}) => writeFileSync(join(reports, "react-orders-filter-017.json"), JSON.stringify({ taskId: "react-orders-filter-017", bundleChecksum: checksum, passed: true, mutationCaptureRate: 1, ...over }));
  try {
    // No report → denied.
    const missing = cli("suite", "publish", "--id", "t", "--version", "1", "--type", "regression", "--task", task, "--calibration", reports, "--out", join(root, "suite.json"));
    assert.equal(missing.status, 1); assert.match(JSON.parse(missing.stdout).denied.join("\n"), /no calibration report/);
    // Stale report (different checksum) → denied.
    writeReport({ bundleChecksum: "sha256:" + "0".repeat(64) });
    const stale = cli("suite", "publish", "--id", "t", "--version", "1", "--type", "regression", "--task", task, "--calibration", reports, "--out", join(root, "suite.json"));
    assert.equal(stale.status, 1); assert.match(JSON.parse(stale.stdout).denied.join("\n"), /does not match bundle/);
    // Failing report → denied.
    writeReport({ passed: false, mutationCaptureRate: 0.8 });
    const failing = cli("suite", "publish", "--id", "t", "--version", "1", "--type", "regression", "--task", task, "--calibration", reports, "--out", join(root, "suite.json"));
    assert.equal(failing.status, 1); assert.match(JSON.parse(failing.stdout).denied.join("\n"), /did not pass/);
    // Passing, matching report → published; ledger written.
    writeReport();
    const good = cli("suite", "publish", "--id", "t", "--version", "1", "--type", "regression", "--task", task, "--calibration", reports, "--out", join(root, "suite.json"));
    assert.equal(good.status, 0, good.stderr || good.stdout);
    const suite = JSON.parse(readFileSync(join(root, "suite.json"), "utf8"));
    assert.equal(suite.tasks.length, 1); assert.match(suite.manifestChecksum, /^sha256:[a-f0-9]{64}$/);
    assert.equal(existsSync(join(root, "t.published.json")), true);
    // Identical republish keeps publishedAt; a different --out path cannot bypass the ledger for the same version.
    const again = JSON.parse(cli("suite", "publish", "--id", "t", "--version", "1", "--type", "regression", "--task", task, "--calibration", reports, "--out", join(root, "elsewhere.json")).stdout);
    assert.equal(again.publishedAt, suite.publishedAt);
    // Duplicate task → denied.
    const dup = cli("suite", "publish", "--id", "t", "--version", "2", "--type", "regression", "--task", task, "--task", task, "--calibration", reports, "--out", join(root, "dup.json"));
    assert.equal(dup.status, 1); assert.match(JSON.parse(dup.stdout).denied.join("\n"), /shares a bundle checksum|duplicate task id/);
    // A task without references cannot be published.
    const incomplete = cli("suite", "publish", "--id", "t", "--version", "3", "--type", "regression", "--task", new URL("../fixtures/projects/node-min", import.meta.url).pathname, "--calibration", reports, "--out", join(root, "inc.json"));
    assert.equal(incomplete.status, 1); assert.match(JSON.parse(incomplete.stdout).denied.join("\n"), /references\/gold\/expected.json missing/);
    // Hidden-to-public leak: a copy of the task with a hidden spec line pasted into README is denied.
    const leaky = join(root, "leaky"); cpSync(task, leaky, { recursive: true });
    const spec = readFileSync(join(leaky, "evaluator", "hidden", "functional.spec.mjs"), "utf8").split("\n").find((l) => l.trim().length >= 40 && /waitForFunction|page\./.test(l));
    writeFileSync(join(leaky, "README.md"), readFileSync(join(leaky, "README.md"), "utf8") + "\n" + spec + "\n");
    const leakChecksum = JSON.parse(cli("checksum", leaky).stdout).bundleChecksum;
    writeReport({ bundleChecksum: leakChecksum });
    const leak = cli("suite", "publish", "--id", "t", "--version", "4", "--type", "regression", "--task", leaky, "--calibration", reports, "--out", join(root, "leak.json"));
    assert.equal(leak.status, 1); assert.match(JSON.parse(leak.stdout).denied.join("\n"), /hidden assertion text appears in public file README.md/);
  } finally { removeTree(root); }
});

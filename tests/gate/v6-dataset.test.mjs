import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);
const tasksRoot = new URL("../../datasets/tasks", import.meta.url).pathname;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
const tasks = readdirSync(tasksRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

test("GATE-V6.3-001: every dataset task is a complete, validated, calibratable bundle", () => {
  assert.ok(tasks.length >= 4, tasks.join(","));
  for (const id of tasks) {
    const bundle = join(tasksRoot, id);
    assert.equal(cli("validate", join(bundle, "task.yaml")).status, 0, `${id} task.yaml`);
    assert.equal(cli("checksum", bundle).status, 0, `${id} checksum`);
    for (const path of ["README.md", "src", "tests", "evaluator/hidden/functional.spec.mjs", "evaluator/hidden/baselines/desktop.png", "references/gold/expected.json", "references/gold/tests", "references/alternative/expected.json", "references/alternative/tests", "references/README.md"]) {
      assert.equal(existsSync(join(bundle, path)), true, `${id}: ${path}`);
    }
    const mutations = readdirSync(join(bundle, "references", "mutations"), { withFileTypes: true }).filter((e) => e.isDirectory());
    assert.ok(mutations.length >= 5, `${id}: ${mutations.length} mutations`);
    for (const mutation of mutations) assert.equal(existsSync(join(bundle, "references", "mutations", mutation.name, "expected.json")), true, `${id}: ${mutation.name}`);
    const task = readFileSync(join(bundle, "task.yaml"), "utf8");
    assert.match(task, new RegExp(`^id: ${id}$`, "m"));
    assert.match(task, /taskType: (feature|bugfix|visual|async|accessibility|refactor)/);
  }
});

test("GATE-V6.3-002: task ids and bundle checksums are unique across the dataset", () => {
  const checksums = tasks.map((id) => JSON.parse(cli("checksum", join(tasksRoot, id)).stdout).bundleChecksum);
  assert.equal(new Set(checksums).size, tasks.length);
});

test("GATE-V6.3-003: published suite lists every dataset task with its current checksum and a passing bound calibration report", () => {
  const suite = JSON.parse(readFileSync(new URL("../../datasets/suites/mvp-regression.json", import.meta.url), "utf8"));
  assert.equal(suite.tasks.length, tasks.length);
  for (const entry of suite.tasks) {
    const checksum = JSON.parse(cli("checksum", join(tasksRoot, entry.taskId)).stdout).bundleChecksum;
    assert.equal(entry.bundleChecksum, checksum, `${entry.taskId} checksum drifted since publication`);
    const report = JSON.parse(readFileSync(new URL(`../../datasets/calibration/${entry.taskId}.json`, import.meta.url), "utf8"));
    assert.equal(report.bundleChecksum, checksum, `${entry.taskId} calibration report is stale`);
    assert.equal(report.passed, true); assert.equal(report.mutationCaptureRate, 1);
  }
  const distribution = {};
  for (const id of tasks) distribution[readFileSync(join(tasksRoot, id, "task.yaml"), "utf8").match(/taskType: (\w+)/)[1]] = (distribution[readFileSync(join(tasksRoot, id, "task.yaml"), "utf8").match(/taskType: (\w+)/)[1]] ?? 0) + 1;
  assert.deepEqual(distribution, { feature: 3, bugfix: 3, visual: 1, async: 1, accessibility: 1, refactor: 1 });
});

test("GATE-V6.4-001: committed reliability baseline — every task has gold success@5 = 5 and noop 0, all conclusions stable", () => {
  const dir = new URL("../../datasets/reliability/", import.meta.url);
  const reports = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(reports.map((f) => f.replace(".json", "")), tasks);
  for (const file of reports) {
    const report = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const gold = report.comparisons.find((c) => c.configurationId.startsWith("gold:"));
    const noop = report.comparisons.find((c) => c.configurationId.startsWith("noop:"));
    assert.deepEqual([gold.requestedK, gold.successAtK, gold.allAtK], [5, 5, true], `${file} gold`);
    assert.deepEqual([noop.successAtK, noop.anyAtK], [0, false], `${file} noop`);
    assert.equal(gold.finalInfrastructureRate, 0, `${file} infra`);
    for (const id of [gold.configurationId, noop.configurationId]) assert.equal(report.extensions.stability[id].agreement, 1, `${file} ${id} stability`);
    assert.equal(new Set(report.extensions.seeds[gold.configurationId]).size, 5);
  }
});

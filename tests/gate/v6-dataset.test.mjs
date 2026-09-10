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

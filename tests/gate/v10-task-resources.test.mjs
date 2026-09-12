import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);
const fixture = new URL("../fixtures/design/dao-synthetic", import.meta.url).pathname;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
const json = (r) => { assert.equal(r.status, 0, r.stderr || r.stdout); return JSON.parse(r.stdout); };

function copyFixture(root, mutate = () => {}) {
  const bundle = join(root, "bundle");
  cpSync(fixture, bundle, { recursive: true });
  mutate(bundle);
  return bundle;
}
const editTask = (bundle, replace) => writeFileSync(join(bundle, "task.yaml"), replace(readFileSync(join(bundle, "task.yaml"), "utf8")));

test("GATE-V10-001: environment.resources is validated, read as task metadata and drives the Run's sandbox limits", async () => {
  const { validateTaskFile, preflightTaskBundle, readPreflightedTaskBundle } = await import(contracts);
  const root = mkdtempSync(join(tmpdir(), "fab-resources-"));
  try {
    // Default: no resources block -> runner defaults (512 MiB / 1 cpu / 128 pids).
    const plain = copyFixture(join(root, "plain"));
    assert.equal(readPreflightedTaskBundle(plain).resources, undefined);
    const created = json(cli("run", "create", plain, "--seed", "1", "--sandbox", "docker", "--design-mode", "both", "--db", join(root, "plain.sqlite")));
    const input = JSON.parse(readFileSync(join(root, created.runId, "input.json"), "utf8"));
    assert.deepEqual(input.sandbox.resources, { memoryBytes: 536_870_912, cpus: 1, pidsLimit: 128 });

    // Declared: every field is optional and absent fields keep the defaults.
    const heavy = copyFixture(join(root, "heavy"), (b) => editTask(b, (t) => t.replace("  network: open\n", "  network: open\n  resources: { memoryMb: 2048, cpus: 2 }\n")));
    assert.equal(validateTaskFile(join(heavy, "task.yaml")).valid, true);
    assert.deepEqual(preflightTaskBundle(heavy), { preflight: "passed" });
    assert.deepEqual(readPreflightedTaskBundle(heavy).resources, { memoryMb: 2048, cpus: 2 });
    const heavyRun = json(cli("run", "create", heavy, "--seed", "1", "--sandbox", "docker", "--design-mode", "both", "--db", join(root, "heavy.sqlite")));
    const heavyInput = JSON.parse(readFileSync(join(root, heavyRun.runId, "input.json"), "utf8"));
    assert.deepEqual(heavyInput.sandbox.resources, { memoryBytes: 2048 * 1024 * 1024, cpus: 2, pidsLimit: 128 });
    // Resources are part of the immutable input, so a Task with different limits hashes differently.
    assert.notEqual(heavyRun.inputHash, created.inputHash);

    // Out-of-range or unknown fields are rejected by the schema.
    const tooBig = copyFixture(join(root, "big"), (b) => editTask(b, (t) => t.replace("  network: open\n", "  network: open\n  resources: { memoryMb: 65536 }\n")));
    assert.equal(validateTaskFile(join(tooBig, "task.yaml")).valid, false);
    const unknown = copyFixture(join(root, "unknown"), (b) => editTask(b, (t) => t.replace("  network: open\n", "  network: open\n  resources: { gpus: 1 }\n")));
    assert.equal(validateTaskFile(join(unknown, "task.yaml")).valid, false);
  } finally { removeTree(root); }
});

test("GATE-V10-002: baseline/calibrate/repeat/batch accept --design-mode and default design tasks to `both`", () => {
  const source = readFileSync(new URL("../../apps/cli/src/index.ts", import.meta.url), "utf8");
  // Each reference workflow must forward the option (or the default) to its child `run create`.
  for (const command of ["writeBaselines", "calibrateTask", "repeatTask", "batchTask"]) {
    const body = source.slice(source.indexOf(`async function ${command}(`));
    const end = body.indexOf("\n}\n");
    const fn = body.slice(0, end);
    assert.match(fn, /"--design-mode"/, `${command} does not accept --design-mode`);
    assert.match(fn, /designModeArguments\(/, `${command} does not resolve a design mode for its child Runs`);
  }
  // Usage documents the option for every workflow.
  for (const workflow of ["baseline", "calibrate", "repeat", "batch"]) {
    assert.match(source, new RegExp(`pnpm eval ${workflow} [^"]*--design-mode sketch\\|image\\|both`), `${workflow} usage lacks --design-mode`);
  }
  // The helper defaults to `both` when supported, to the only mode otherwise, and to nothing for non-design tasks.
  assert.match(source, /metadata\.design\.modes\.includes\("both"\) \? "both" : metadata\.design\.modes\[0\]!/);
  assert.match(source, /return metadata\.design \? \[/);
});

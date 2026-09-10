import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeTree } from "./_cleanup.mjs";

const repoRoot = new URL("../..", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url).pathname;
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0 ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}` : false;
const cli = (...args) => spawnSync("pnpm", ["eval", ...args], { cwd: repoRoot, encoding: "utf8", timeout: 1_500_000, maxBuffer: 64 * 1024 * 1024 });

test("GATE-V5.2-Docker: calibration captures 100% of declared mutations and passes both correct references", { skip: unavailable, timeout: 1_800_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "fab-calibration-"));
  try {
    const out = join(root, "report.json");
    const run = cli("calibrate", task, "--out", out);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(report.passed, true, JSON.stringify(report.entries.filter((e) => !e.passed).map((e) => [e.reference, e.mismatches])));
    assert.equal(report.mutationCaptureRate, 1);
    const kinds = new Set(report.entries.map((e) => e.kind));
    assert.deepEqual([...kinds].sort(), ["alternative", "gold", "mutation"]);
    for (const entry of report.entries.filter((e) => e.kind !== "mutation")) assert.equal(entry.observed.scores.engineering, 1, `${entry.reference} engineering`);
  } finally { removeTree(root); }
});

test("GATE-V5.2-Docker: repeated gold Runs with a fixed seed reach identical conclusions", { skip: unavailable, timeout: 900_000 }, () => {
  const run = cli("repeat", task, "--times", "2", "--scenario", "reference:gold");
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.identical, true, JSON.stringify(report.differences));
  assert.equal(report.runIds.length, 2);
});

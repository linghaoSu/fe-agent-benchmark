import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const calibration = new URL("../../packages/calibration/dist/index.js", import.meta.url);
const task = new URL("../../datasets/tasks/react-orders-filter-017", import.meta.url).pathname;

const result = (over = {}) => ({
  schemaVersion: 1, runId: "run", attemptId: "attempt", evaluatedSnapshotDigest: "sha256:x", task: { id: "t", version: 1 },
  valid: true, solved: true, evidenceRefs: { valid: ["a"], solved: ["a"] },
  scores: { build: { value: 1, evidenceRefs: ["a"] }, functional: { value: 1, evidenceRefs: ["a"] }, visual: { value: 0.9, evidenceRefs: ["a"] }, responsive: { value: 1, evidenceRefs: ["a"] }, accessibility: { value: 1, evidenceRefs: ["a"] }, engineering: { value: 1, evidenceRefs: ["a"] } },
  efficiency: { inputTokens: 0, outputTokens: 0, toolCalls: 3, toolOutputBytes: 10, wallTimeSeconds: 12.5, costUsd: 0 },
  extensions: { executionClassification: "completed", gates: { integrity: "passed", build: "passed", criticalFunctionalTests: "passed" }, dimensions: { visual: "passed", responsive: "passed", accessibility: "passed", engineering: "passed" }, quality: 0.98 },
  ...over,
});

test("GATE-V5.2-001: calibrate matches solved, gates, dimensions, codes and score bounds", async () => {
  const { calibrate, buildCalibrationReport } = await import(calibration);
  const gold = calibrate({ reference: "gold", runId: "r1", result: result(), privateCodes: ["FUNCTIONAL_PASSED"] }, { expect: { valid: true, solved: true } });
  assert.equal(gold.passed, true); assert.equal(gold.kind, "gold");
  const broken = result({ solved: false, extensions: { gates: { criticalFunctionalTests: "failed" }, dimensions: {} } });
  const captured = calibrate({ reference: "mutations/drop", runId: "r2", result: broken, privateCodes: ["FUNCTIONAL_CRITICAL_FAILED"] }, { expect: { solved: false, gates: { criticalFunctionalTests: "failed" }, codes: ["FUNCTIONAL_CRITICAL_FAILED"] } });
  assert.equal(captured.passed, true); assert.equal(captured.kind, "mutation");
  const missed = calibrate({ reference: "mutations/silent", runId: "r3", result: result(), privateCodes: ["FUNCTIONAL_PASSED"] }, { expect: { solved: false, scoreBelow: { accessibility: 1 } } });
  assert.equal(missed.passed, false); assert.equal(missed.mismatches.length, 2);
  const alternative = calibrate({ reference: "alternative", runId: "r4", result: result(), privateCodes: [] }, { expect: { solved: true } });
  const report = buildCalibrationReport({ id: "t", version: 1 }, [gold, alternative, captured, missed], "2026-01-01T00:00:00Z");
  assert.equal(report.mutationCaptureRate, 0.5); assert.equal(report.passed, false);
  assert.equal(buildCalibrationReport({ id: "t", version: 1 }, [gold, alternative, captured], "2026-01-01T00:00:00Z").passed, true);
});

test("GATE-V5.2-002: repeat comparator ignores ids/efficiency but flags conclusion drift", async () => {
  const { compareRepeats } = await import(calibration);
  const same = compareRepeats([result(), result({ runId: "other", attemptId: "other", efficiency: { inputTokens: 0, outputTokens: 0, toolCalls: 3, toolOutputBytes: 10, wallTimeSeconds: 99, costUsd: 0 } })]);
  assert.equal(same.identical, true);
  const drift = compareRepeats([result(), result({ scores: { ...result().scores, visual: { value: 0.7, evidenceRefs: ["a"] } } })]);
  assert.equal(drift.identical, false); assert.deepEqual(drift.differences.map((d) => d.path), ["result.scores.visual.value"]);
});

test("GATE-V5.2-003: react-orders ships gold, an alternative and mutations with expectations", () => {
  const references = join(task, "references");
  assert.equal(existsSync(join(references, "gold", "src", "app.js")), true);
  assert.equal(existsSync(join(references, "alternative", "src")), true);
  const mutations = readdirSync(join(references, "mutations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(mutations.length >= 6, `mutations: ${mutations.join(",")}`);
  for (const name of mutations) {
    const expected = JSON.parse(readFileSync(join(references, "mutations", name, "expected.json"), "utf8"));
    assert.ok(expected.expect && typeof expected.expect === "object", name);
    assert.equal(existsSync(join(references, "mutations", name, "src", "app.js")), true, name);
  }
});

test("GATE-V5.2-004: a report without gold, alternative and a mutation cannot pass", async () => {
  const { calibrate, buildCalibrationReport } = await import(calibration);
  const gold = calibrate({ reference: "gold", runId: "r1", result: result(), privateCodes: [] }, { expect: { solved: true } });
  const goldOnly = buildCalibrationReport({ id: "t", version: 1 }, [gold], "2026-01-01T00:00:00Z");
  assert.equal(goldOnly.passed, false); assert.equal(goldOnly.mutationCaptureRate, 0); assert.deepEqual(goldOnly.incomplete, ["alternative", "mutation"]);
});

test("GATE-V5.2-005: repeat comparison includes environment fingerprints and ordered codes", async () => {
  const { compareRepeats } = await import(calibration);
  const sample = (over = {}) => ({ result: result(), fingerprint: { inputHash: "h1", imageDigest: "sha256:img", dependencyCacheSnapshotId: "snap", networkPolicyId: "np" }, codes: ["INTEGRITY_PASSED", "BUILD_PASSED"], ...over });
  assert.equal(compareRepeats([sample(), sample()]).identical, true);
  const skew = compareRepeats([sample(), sample({ fingerprint: { inputHash: "h1", imageDigest: "sha256:other", dependencyCacheSnapshotId: "snap", networkPolicyId: "np" } })]);
  assert.deepEqual(skew.differences.map((d) => d.path), ["fingerprint.imageDigest"]);
  const codes = compareRepeats([sample(), sample({ codes: ["INTEGRITY_PASSED", "BUILD_TEST_FAILED"] })]);
  assert.deepEqual(codes.differences.map((d) => d.path), ["codes"]);
});

test("GATE-V5.2-006: every react-orders reference declares a validated expectation", () => {
  const references = join(task, "references");
  const names = ["gold", "alternative", ...readdirSync(join(references, "mutations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `mutations/${e.name}`)];
  for (const name of names) {
    const expected = JSON.parse(readFileSync(join(references, name, "expected.json"), "utf8"));
    assert.ok(Object.keys(expected.expect).length > 0, name);
  }
});

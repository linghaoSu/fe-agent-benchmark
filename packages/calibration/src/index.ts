import type { FrontendAgentEvaluationResult } from "@frontend-agent-benchmark/contracts";

/** What a reference implementation is expected to produce (stored as `references/<name>/expected.json`). */
export interface ReferenceExpectation {
  description?: string;
  expect: {
    solved?: boolean;
    valid?: boolean;
    gates?: Record<string, string>;
    dimensions?: Record<string, string>;
    codes?: string[];
    scoreBelow?: Record<string, number>;
    scoreAtLeast?: Record<string, number>;
  };
}

export interface ReferenceObservation {
  reference: string;
  runId: string;
  result: FrontendAgentEvaluationResult;
  privateCodes: string[];
}

export interface CalibrationEntry {
  reference: string;
  runId: string;
  kind: "gold" | "alternative" | "mutation";
  expected: ReferenceExpectation["expect"];
  observed: { valid: boolean; solved: boolean; gates: Record<string, string>; dimensions: Record<string, string>; scores: Record<string, number>; codes: string[] };
  mismatches: string[];
  passed: boolean;
}

export interface CalibrationReport {
  schemaVersion: 1;
  taskId: string;
  taskVersion: number;
  createdAt: string;
  entries: CalibrationEntry[];
  mutationCaptureRate: number;
  passed: boolean;
  incomplete?: string[];
}

function kindOf(reference: string): CalibrationEntry["kind"] {
  if (reference === "gold") return "gold";
  if (reference.startsWith("mutations/")) return "mutation";
  return "alternative";
}

function scoresOf(result: FrontendAgentEvaluationResult): Record<string, number> {
  return Object.fromEntries(Object.entries(result.scores).map(([name, score]) => [name, (score as { value: number }).value]));
}

/** Pure comparison of one observed Result against its declared expectation. */
export function calibrate(observation: ReferenceObservation, expectation: ReferenceExpectation): CalibrationEntry {
  const { result } = observation;
  const extensions = (result.extensions ?? {}) as { gates?: Record<string, string>; dimensions?: Record<string, string> };
  const observed = {
    valid: result.valid,
    solved: result.solved,
    gates: extensions.gates ?? {},
    dimensions: extensions.dimensions ?? {},
    scores: scoresOf(result),
    codes: observation.privateCodes,
  };
  const expect = expectation.expect;
  const mismatches: string[] = [];
  if (expect.valid !== undefined && observed.valid !== expect.valid) mismatches.push(`valid: expected ${expect.valid}, observed ${observed.valid}`);
  if (expect.solved !== undefined && observed.solved !== expect.solved) mismatches.push(`solved: expected ${expect.solved}, observed ${observed.solved}`);
  for (const [gate, status] of Object.entries(expect.gates ?? {})) {
    if (observed.gates[gate] !== status) mismatches.push(`gate ${gate}: expected ${status}, observed ${observed.gates[gate] ?? "absent"}`);
  }
  for (const [dimension, status] of Object.entries(expect.dimensions ?? {})) {
    if (observed.dimensions[dimension] !== status) mismatches.push(`dimension ${dimension}: expected ${status}, observed ${observed.dimensions[dimension] ?? "absent"}`);
  }
  for (const code of expect.codes ?? []) {
    if (!observed.codes.includes(code)) mismatches.push(`code ${code} not emitted`);
  }
  for (const [score, bound] of Object.entries(expect.scoreBelow ?? {})) {
    if (!(observed.scores[score] !== undefined && observed.scores[score]! < bound)) mismatches.push(`score ${score}: expected < ${bound}, observed ${observed.scores[score] ?? "absent"}`);
  }
  for (const [score, bound] of Object.entries(expect.scoreAtLeast ?? {})) {
    if (!(observed.scores[score] !== undefined && observed.scores[score]! >= bound)) mismatches.push(`score ${score}: expected >= ${bound}, observed ${observed.scores[score] ?? "absent"}`);
  }
  return { reference: observation.reference, runId: observation.runId, kind: kindOf(observation.reference), expected: expect, observed, mismatches, passed: mismatches.length === 0 };
}

/** FR-014 / SC-003: every correct reference must be solved and every declared Mutation must be captured (100%). */
export function buildCalibrationReport(task: { id: string; version: number }, entries: CalibrationEntry[], createdAt: string): CalibrationReport {
  const mutations = entries.filter((entry) => entry.kind === "mutation");
  const captured = mutations.filter((entry) => entry.passed).length;
  const kinds = new Set(entries.map((entry) => entry.kind));
  // A calibrated task needs a Gold, a structurally different Alternative and at least one Mutation (FR-014);
  // a report over fewer kinds cannot pass, and a missing mutation set is 0% capture, not 100%.
  const complete = kinds.has("gold") && kinds.has("alternative") && mutations.length > 0;
  return {
    schemaVersion: 1,
    taskId: task.id,
    taskVersion: task.version,
    createdAt,
    entries,
    mutationCaptureRate: mutations.length ? captured / mutations.length : 0,
    passed: complete && entries.every((entry) => entry.passed),
    ...(complete ? {} : { incomplete: [...(!kinds.has("gold") ? ["gold"] : []), ...(!kinds.has("alternative") ? ["alternative"] : []), ...(mutations.length ? [] : ["mutation"])] }),
  };
}

/** Fields that legitimately vary between otherwise identical Runs (timing, ids, cost) and are excluded from repeat comparison. */
export const NONDETERMINISTIC_RESULT_FIELDS = ["runId", "attemptId", "efficiency"] as const;

export interface RepeatComparison {
  identical: boolean;
  differences: Array<{ path: string; values: unknown[] }>;
  compared: string[];
}

/** Per-Run inputs that must also agree for repeats to be comparable (SC-005 environment/input fingerprints). */
export interface RepeatSample {
  result: FrontendAgentEvaluationResult;
  fingerprint: { inputHash: string; imageDigest?: string; dependencyCacheSnapshotId?: string; networkPolicyId?: string };
  /** Ordered stable private codes from producer records. */
  codes: string[];
}

function stripNondeterministic(result: FrontendAgentEvaluationResult): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(result as unknown as Record<string, unknown>) };
  for (const field of NONDETERMINISTIC_RESULT_FIELDS) delete copy[field];
  // Evidence refs embed the attempt ordinal, which is stable for un-retried Runs, but drop them anyway: the
  // comparator is about conclusions, not artifact layout.
  const withoutEvidence = JSON.parse(JSON.stringify(copy, (key, value) => (key === "evidenceRefs" ? undefined : value))) as Record<string, unknown>;
  return withoutEvidence;
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
    return;
  }
  out.set(prefix, value);
}

/** SC-005: identical input + environment + seed must produce identical conclusions across repeated Runs. */
export function compareRepeats(samples: Array<FrontendAgentEvaluationResult | RepeatSample>): RepeatComparison {
  if (samples.length < 2) return { identical: true, differences: [], compared: [] };
  const flattened = samples.map((sample) => {
    const out = new Map<string, unknown>();
    const result = "result" in sample && "fingerprint" in sample ? sample.result : sample as FrontendAgentEvaluationResult;
    flatten(stripNondeterministic(result), "result", out);
    if ("fingerprint" in sample) { flatten(sample.fingerprint, "fingerprint", out); out.set("codes", sample.codes); }
    return out;
  });
  const keys = [...new Set(flattened.flatMap((map) => [...map.keys()]))].sort();
  const differences: RepeatComparison["differences"] = [];
  for (const key of keys) {
    const values = flattened.map((map) => map.get(key));
    const serialized = values.map((value) => JSON.stringify(value));
    if (new Set(serialized).size > 1) differences.push({ path: key, values });
  }
  return { identical: differences.length === 0, differences, compared: keys };
}

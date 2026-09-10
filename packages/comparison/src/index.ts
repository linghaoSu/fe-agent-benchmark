import type { FrontendAgentComparisonReport, FrontendAgentEvaluationResult } from "@frontend-agent-benchmark/contracts";

/** One finished Run of a configuration as seen by the aggregator. Runs without a Result contribute to infrastructure rates only. */
export interface RunSample {
  runId: string;
  seed: number;
  status: "COMPLETED" | "FAILED";
  result?: FrontendAgentEvaluationResult;
  /** Execution classification of the final Attempt. */
  finalClassification: string;
  /** Number of Attempts the Run needed (1 = no infrastructure retry). */
  attempts: number;
}

export interface ConfigurationSamples {
  configurationId: string;
  runs: RunSample[];
}

const SCORE_NAMES = ["build", "functional", "visual", "responsive", "accessibility", "engineering"] as const;

function mean(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function round(value: number): number { return Number(value.toFixed(6)); }

/**
 * FR-012 aggregation over independent Runs of one configuration. `k` counts Runs, never Attempts: an
 * infrastructure retry inside a Run does not create a second sample.
 *  - successAtK: solved Runs among the first k
 *  - anyAtK / allAtK: ≥1 / all of the first k solved
 *  - rawInfrastructureRate: share of Attempts across the window that ended infrastructure_error
 *  - finalInfrastructureRate: share of Runs whose FINAL classification is infrastructure_error
 */
export function summarizeConfiguration(configuration: ConfigurationSamples, k = configuration.runs.length): FrontendAgentComparisonReport["comparisons"][number] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer");
  const window = configuration.runs.slice(0, k);
  const solved = window.filter((run) => run.result?.solved === true).length;
  const withResult = window.filter((run): run is RunSample & { result: FrontendAgentEvaluationResult } => Boolean(run.result));
  const totalAttempts = window.reduce((total, run) => total + run.attempts, 0);
  // Every Attempt before the final one was an infrastructure retry; the final one counts only if it also failed that way.
  const infrastructureAttempts = window.reduce((total, run) => total + Math.max(0, run.attempts - 1) + (run.finalClassification === "infrastructure_error" ? 1 : 0), 0);
  return {
    configurationId: configuration.configurationId,
    requestedK: k,
    successAtK: solved,
    anyAtK: solved > 0,
    allAtK: window.length > 0 && solved === window.length,
    rawInfrastructureRate: round(totalAttempts ? infrastructureAttempts / totalAttempts : 0),
    finalInfrastructureRate: round(window.length ? window.filter((run) => run.finalClassification === "infrastructure_error").length / window.length : 0),
    meanCostUsd: round(mean(withResult.map((run) => run.result.efficiency.costUsd))),
    meanWallTimeSeconds: round(mean(withResult.map((run) => run.result.efficiency.wallTimeSeconds))),
    meanScores: Object.fromEntries(SCORE_NAMES.map((name) => [name, round(mean(withResult.map((run) => run.result.scores[name].value)))])) as FrontendAgentComparisonReport["comparisons"][number]["meanScores"],
  };
}

/** Stability of discrete conclusions across a configuration's Runs: 1 when every Run agrees on valid/solved/gates/classification. */
export function stabilityOf(configuration: ConfigurationSamples): { agreement: number; distinctConclusions: number } {
  const conclusions = configuration.runs.map((run) => JSON.stringify(run.result
    ? { valid: run.result.valid, solved: run.result.solved, gates: (run.result.extensions as { gates?: unknown } | undefined)?.gates ?? null, classification: run.finalClassification }
    : { classification: run.finalClassification }));
  const counts = new Map<string, number>();
  for (const conclusion of conclusions) counts.set(conclusion, (counts.get(conclusion) ?? 0) + 1);
  const dominant = Math.max(0, ...counts.values());
  return { agreement: conclusions.length ? round(dominant / conclusions.length) : 1, distinctConclusions: counts.size };
}

export function buildComparisonReport(input: { comparisonReportId: string; createdAt: string; configurations: ConfigurationSamples[]; k?: number }): FrontendAgentComparisonReport {
  return {
    schemaVersion: 1,
    comparisonReportId: input.comparisonReportId,
    createdAt: input.createdAt,
    configurations: input.configurations.map((configuration) => ({ configurationId: configuration.configurationId, runIds: configuration.runs.map((run) => run.runId) })),
    comparisons: input.configurations.map((configuration) => summarizeConfiguration(configuration, input.k ?? configuration.runs.length)),
    extensions: {
      stability: Object.fromEntries(input.configurations.map((configuration) => [configuration.configurationId, stabilityOf(configuration)])),
      seeds: Object.fromEntries(input.configurations.map((configuration) => [configuration.configurationId, configuration.runs.map((run) => run.seed)])),
    },
  };
}

export const SCORE_NAMES = ['build', 'functional', 'visual', 'responsive', 'accessibility', 'engineering'] as const;
export type ScoreName = typeof SCORE_NAMES[number];

export interface Efficiency {
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  toolOutputBytes: number;
  wallTimeSeconds: number;
  costUsd: number;
}

export interface RunSummary {
  runId: string;
  db: string;
  taskId: string;
  taskVersion: number;
  seed: number;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  model: string;
  executionClassification: string | null;
  solved: boolean | null;
  scores: Record<ScoreName, number | null>;
  quality: number | null;
  efficiency: Efficiency | null;
  budgetProfile: string | null;
  network: string | null;
  bundleChecksum: string;
  fingerprint: { imageDigest?: string; dependencyCacheSnapshotId?: string; networkPolicyId?: string };
}

export interface Transition {
  seq: number;
  fromState: string;
  toState: string;
  reason: string | null;
  at: string;
  attemptId?: string;
}

export interface Attempt {
  attemptId: string;
  ordinal: number;
  seed: number;
  lifecycleStatus: string;
  agentOutcome: string | null;
  executionClassification: string | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ToolCall {
  seq: number;
  tool: string;
  argumentsJson: string | null;
  status: string;
  outcomeCode: string | null;
  outputBytes: number | null;
  truncated: boolean;
  artifactRef: string | null;
  acceptedAt: string;
}

export interface Artifact {
  logicalType: string;
  mime: string;
  relativePath: string;
  size: number;
  audience: string;
}

export interface EvaluatorResult {
  status: string;
  outcome?: { passed: boolean; privateCode?: string; summary?: string; score?: number };
  evidenceRefs?: string[];
}

export interface FunctionalTest {
  id: string;
  passed: boolean;
  critical: boolean;
  message?: string;
}

export interface RunEvent {
  seq: number;
  type: string;
  timestamp: string;
  payload: { name?: string; data?: unknown; [key: string]: unknown };
}

export interface RunDetail {
  summary: RunSummary;
  run: Record<string, unknown> & { resolvedInputJson?: string; inputHash?: string };
  transitions: Transition[];
  attempts: Attempt[];
  attemptTransitions: Transition[];
  producerRecords: Record<string, unknown>[];
  toolCalls: ToolCall[];
  artifacts: Artifact[];
  manifests: Record<string, unknown>[];
  /** The server returns the raw sqlite row, so the key may be snake_case. */
  result: { resultJson?: string; result_json?: string } | null;
  evaluators: Record<string, EvaluatorResult>;
  functionalTests: { tests: FunctionalTest[] } | null;
  visual: Record<string, { compared?: boolean; mismatch?: number; score?: number } | null>;
  events: RunEvent[];
}

export interface TaskSummary {
  taskId: string;
  runs: number;
  byModel: Record<string, { runs: number; solved: number }>;
}

export interface ConfigurationSummary {
  requestedK: number;
  successAtK: number;
  anyAtK: number;
  allAtK: number;
  rawInfrastructureRate: number;
  finalInfrastructureRate: number;
  meanCostUsd: number;
  meanWallTimeSeconds: number;
  meanScores: Partial<Record<ScoreName, number>>;
}

export interface Configuration {
  configurationId: string;
  runs: { runId: string; seed: number; solved: boolean | null; status: string }[];
  summary: ConfigurationSummary | null;
  meanInputTokens: number;
  meanOutputTokens: number;
  comparable: boolean;
  fingerprints: string[];
}

export interface CompareResponse {
  taskId: string | null;
  k: number | undefined;
  configurations: Configuration[];
}

export interface ResultExtensions {
  gates?: Record<string, string>;
  dimensions?: Record<string, string>;
  quality?: number;
  executionClassification?: string;
}

/** dao-table's `data` prop requires an index signature; wrap typed rows at the template boundary. */
export type TableRows = Record<string, unknown>[];
export const asRows = <T>(rows: T[] | null | undefined): TableRows => (rows ?? []) as unknown as TableRows;

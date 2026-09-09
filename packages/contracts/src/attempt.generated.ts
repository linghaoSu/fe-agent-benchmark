// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluationAttempt = {
  "schemaVersion": number;
  "attemptId": string;
  "runId": string;
  "ordinal": number;
  "seed": number;
  "lifecycleStatus": "created" | "sandbox_starting" | "agent_running" | "agent_stopping" | "workspace_frozen" | "evaluating" | "finalizing" | "failed" | "succeeded";
  "agentOutcome": "not_started" | "completed" | "adapter_error" | "model_error" | "budget_exhausted" | "cancelled";
  "terminationCause"?: string;
  "terminationPhase"?: "sandbox_starting" | "agent" | "evaluation";
  "executionClassification"?: "completed" | "agent_failure" | "budget_exhausted" | "invalid" | "infrastructure_error" | "evaluator_error";
  "failureCode"?: string;
  "agentNetworkId"?: string;
  "evaluationNetworkId"?: string;
  "submissionSnapshotDigest"?: string;
  "extensions"?: Record<string, unknown>;
};

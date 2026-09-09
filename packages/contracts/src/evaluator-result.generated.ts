// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluatorResult = {
  "schemaVersion": number;
  "evaluatorResultId": string;
  "evaluatorId": string;
  "evaluatorVersion": string;
  "attemptId": string;
  "stage": string;
  "prerequisites"?: Array<string>;
  "deterministic": boolean;
  "status": "passed" | "failed" | "skipped" | "error";
  "evaluatedSnapshotDigest": string;
  "outcome": {
    "passed": boolean;
    "privateCode": string;
    "summary"?: string;
    "score"?: number;
  };
  "producerRef": string;
  "evidenceRefs": Array<string>;
  "extensions"?: Record<string, unknown>;
};

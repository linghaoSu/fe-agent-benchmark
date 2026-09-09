// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentProducerRecord = {
  "schemaVersion": number;
  "producerId": string;
  "attemptId": string;
  "kind": "evaluator" | "policy" | "adapter" | "budget" | "infrastructure";
  "phase": string;
  "privateCode": string;
  "boundedSummary": string;
  "artifactRefs": Array<string>;
  "extensions"?: Record<string, unknown>;
};

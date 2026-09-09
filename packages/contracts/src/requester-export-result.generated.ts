// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentRequesterExportResult = {
  "schemaVersion": number;
  "requesterExportResultId": string;
  "exportId": string;
  "runId": string;
  "task": {
    "id": string;
    "version": number;
  };
  "valid": boolean;
  "solved": boolean;
  "publicOutcomeCode": "SOLVED" | "UNSOLVED" | "INVALID" | "NOT_EVALUATED";
  "scores": {
    "build": number;
    "functional": number;
    "visual": number;
    "responsive": number;
    "accessibility": number;
    "engineering": number;
  };
  "efficiency": {
    "inputTokens": number;
    "outputTokens": number;
    "toolCalls": number;
    "toolOutputBytes"?: number;
    "wallTimeSeconds": number;
    "costUsd": number;
  };
  "extensions"?: Record<string, unknown>;
};

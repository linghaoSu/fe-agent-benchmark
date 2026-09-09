// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluationResult = {
  "schemaVersion": number;
  "runId": string;
  "attemptId"?: string;
  "evaluatedSnapshotDigest"?: string;
  "task": {
    "id": string;
    "version": number;
  };
  "agent"?: {
    "name": string;
    "version": string;
  };
  "model"?: {
    "provider": string;
    "name": string;
  };
  "valid": boolean;
  "solved": boolean;
  "evidenceRefs"?: {
    "valid"?: Array<string>;
    "solved"?: Array<string>;
  };
  "scores": {
    "build": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "functional": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "visual": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "responsive": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "accessibility": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "engineering": {
      "value": number;
      "evidenceRefs": Array<string>;
    };
    "performance"?: {
      "value": number;
      "evidenceRefs": Array<string>;
    };
  };
  "efficiency": {
    "inputTokens": number;
    "outputTokens": number;
    "toolCalls": number;
    "toolOutputBytes"?: number;
    "wallTimeSeconds": number;
    "costUsd": number;
  };
  "failures"?: Array<{
      "category": string;
      "code": string;
      "severity": string;
      "evidenceRefs": Array<string>;
    }>;
  "artifacts"?: {
    "patch": string;
    "events": string;
    "playwrightTrace": string;
    "screenshotsDir": string;
    "evaluatorResultsDir": string;
    "manifest": string;
  };
  "extensions"?: Record<string, unknown>;
};

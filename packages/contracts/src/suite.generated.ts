// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluationSuite = {
  "schemaVersion": number;
  "suiteId": string;
  "version": number;
  "type": "benchmark" | "regression";
  "manifestChecksum": string;
  "publishedAt": string;
  "tasks": Array<{
      "taskId": string;
      "version": number;
      "bundleChecksum": string;
    }>;
  "extensions"?: Record<string, unknown>;
};

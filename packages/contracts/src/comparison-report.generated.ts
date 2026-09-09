// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentComparisonReport = {
  "schemaVersion": number;
  "comparisonReportId": string;
  "createdAt": string;
  "configurations": Array<{
      "configurationId": string;
      "runIds": Array<string>;
    }>;
  "comparisons": Array<{
      "configurationId": string;
      "requestedK": number;
      "successAtK": number;
      "anyAtK": boolean;
      "allAtK": boolean;
      "rawInfrastructureRate": number;
      "finalInfrastructureRate": number;
      "meanCostUsd": number;
      "meanWallTimeSeconds": number;
      "meanScores": {
        "build": number;
        "functional": number;
        "visual": number;
        "responsive": number;
        "accessibility": number;
        "engineering": number;
      };
    }>;
  "extensions"?: Record<string, unknown>;
};

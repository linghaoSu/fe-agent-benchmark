// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentDataScanResult = {
  "schemaVersion": number;
  "dataScanResultId": string;
  "target": {
    "kind": "bundle" | "artifact" | "result";
    "targetId": string;
    "checksum": string;
  };
  "scannerVersion": string;
  "scannerWorkerDigest": string;
  "coveragePolicyVersion": number;
  "coverageOutcome": "complete" | "partial" | "unsupported" | "encrypted" | "corrupt" | "limit_exceeded";
  "coveredSurfaces": Array<string>;
  "resourceLimits": {
    "cpuSeconds": number;
    "memoryBytes": number;
    "wallTimeSeconds": number;
    "maxOutputBytes": number;
  };
  "workerOutcome": "succeeded" | "crashed" | "timeout" | "oom" | "handler_fault";
  "outcome": "passed" | "failed" | "quarantined";
  "findingCode"?: string;
  "scannedAt": string;
  "extensions"?: Record<string, unknown>;
};

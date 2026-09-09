// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentProxyDiagnosticRecord = {
  "schemaVersion": number;
  "proxyDiagnosticId": string;
  "attemptId": string;
  "dependencyCacheSnapshotId": string;
  "proxyConfigurationHash": string;
  "observedAt": string;
  "observationWindow": {
    "startedAt": string;
    "endedAt": string;
  };
  "requestCorrelationHash": string;
  "trustedObservation": string;
  "outcome": "available" | "unavailable";
  "extensions"?: Record<string, unknown>;
};

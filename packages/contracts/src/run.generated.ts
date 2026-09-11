// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluationRun = {
  "schemaVersion": number;
  "runId": string;
  "inputHash": string;
  "task": {
    "id": string;
    "version": number;
    "bundleChecksum": string;
  };
  "suite"?: {
    "suiteId": string;
    "version": number;
  };
  "environment": {
    "imageDigest": string;
    "repositoryCommit": string;
    "locale": string;
    "timezone": string;
  };
  "agent": {
    "id": string;
    "version": string;
  };
  "model"?: {
    "provider": string;
    "name": string;
    "version": string;
    "sampling"?: {
      "temperature"?: number;
      "topP"?: number;
    };
  };
  "prompt"?: {
    "id": string;
    "version": string;
  };
  "harness"?: {
    "id": string;
    "version": string;
  };
  "seedSet": Array<number>;
  "budgets": {
    "maxWallTimeSeconds": number;
    "maxAgentSteps": number;
    "maxCostUsd": number;
  };
  "adapterProtocol": {
    "maxFrameBytes": number;
    "heartbeatTimeoutSeconds": number;
  };
  "dependencyLockHash"?: string | null;
  "dependencyCacheSnapshotId"?: string | null;
  "networkPolicyVersion": number;
  "exportPolicyVersion": number;
  "dataScanCoveragePolicyVersion": number;
  "status": "created" | "preflight" | "attempt_active" | "aggregating" | "completed" | "failed";
  "requestedK": number;
  "createdAt": string;
  "finishedAt"?: string;
  "extensions"?: Record<string, unknown>;
};

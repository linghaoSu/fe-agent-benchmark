// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentToolCall = {
  "schemaVersion": number;
  "toolCallId": string;
  "runId": string;
  "attemptId": string;
  "seq": number;
  "tool": string;
  "arguments": Record<string, unknown>;
  "status": "requested" | "accepted" | "completed" | "succeeded" | "failed" | "rejected";
  "requestedAt": string;
  "completedAt"?: string;
  "result"?: Record<string, unknown>;
  "errorCode"?: string;
  "outcomeCode"?: string;
  "outputBytes"?: number;
  "truncated"?: boolean;
  "artifactRef"?: string;
  "executedAt"?: string;
  "extensions"?: Record<string, unknown>;
};

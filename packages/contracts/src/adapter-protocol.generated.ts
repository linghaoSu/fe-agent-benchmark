// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentAdapterProtocolFrame = ({
  "schemaVersion": number;
  "protocolVersion": number;
  "runId": string;
  "attemptId": string;
  "seq": number;
  "type": "hello" | "ready" | "event" | "tool_request" | "complete" | "error" | "heartbeat" | "hello_ack" | "task_context" | "tool_result" | "cancel" | "budget_update" | "shutdown";
  "timestamp": string;
  "payload": Record<string, unknown>;
  "extensions"?: Record<string, unknown>;
}) & (({
  "type": "hello";
  "payload": {
    "adapter": {
      "id": string;
      "version": string;
    };
    "capabilities": Array<string>;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "ready";
  "payload": {
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "event";
  "payload": {
    "name": string;
    "data"?: Record<string, unknown>;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "tool_request";
  "payload": {
    "toolCallId": string;
    "tool": string;
    "arguments": Record<string, unknown>;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "complete";
  "payload": {
    "outcome": "completed" | "cancelled";
    "summary"?: string;
    "patch"?: string;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "error";
  "payload": {
    "code": string;
    "message": string;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "heartbeat";
  "payload": {
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "hello_ack";
  "payload": {
    "accepted": boolean;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "task_context";
  "payload": {
    "taskId": string;
    "taskVersion": number;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "tool_result";
  "payload": {
    "toolCallId": string;
    "status": "succeeded" | "failed" | "rejected";
    "output"?: Record<string, unknown>;
    "errorCode"?: string;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "cancel";
  "payload": {
    "reason": string;
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "budget_update";
  "payload": {
    "remaining": {
      "wallTimeSeconds": number;
      "steps": number;
      "costUsd": number;
    };
    "extensions"?: Record<string, unknown>;
  };
}) | ({
  "type": "shutdown";
  "payload": {
    "reason"?: string;
    "extensions"?: Record<string, unknown>;
  };
}));

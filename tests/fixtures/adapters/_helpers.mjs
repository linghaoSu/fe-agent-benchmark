import { createInterface } from "node:readline";

export const runId = process.env.FAB_RUN_ID ?? "missing-run";
export const attemptId = process.env.FAB_ATTEMPT_ID ?? "missing-attempt";

export function frame(seq, type, payload, protocolVersion = 1) {
  return {
    schemaVersion: 1,
    protocolVersion,
    runId,
    attemptId,
    seq,
    type,
    timestamp: new Date(0).toISOString(),
    payload,
  };
}

export function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function onFrame(handler) {
  createInterface({ input: process.stdin }).on("line", (line) => handler(JSON.parse(line)));
}

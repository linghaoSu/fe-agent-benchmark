import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export class StartEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { command: string; port: number; start(): Promise<{ log: string; ready?: boolean }> }) {}
  metadata() { return { id: "start", version: "1", stage: "start", prerequisites: ["build"], deterministic: true }; }
  async prepare() {}
  async cleanup() {}
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:start`;
    try {
      await context.assertSnapshot(); const output = await this.input.start(); await context.assertSnapshot();
      const log = context.stageArtifact({ logicalType: "start_log", mime: "text/plain", relativePath: "build/start.log", content: output.log.slice(0, 65536), producerRef });
      if (output.ready === false) return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "start", evaluatorVersion: "1", attemptId: context.attemptId, stage: "start", prerequisites: ["build"], deterministic: true, status: "failed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: false, privateCode: "START_TIMEOUT", summary: "App did not become ready before timeout", score: 0 }, producerRef, evidenceRefs: [log] };
      return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "start", evaluatorVersion: "1", attemptId: context.attemptId, stage: "start", prerequisites: ["build"], deterministic: true, status: "passed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: true, privateCode: "START_PASSED", summary: "App became ready", score: 1 }, producerRef, evidenceRefs: [log] };
    } catch (error) {
      const log = context.stageArtifact({ logicalType: "start_log", mime: "text/plain", relativePath: "build/start.log", content: "", producerRef });
      return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "start", evaluatorVersion: "1", attemptId: context.attemptId, stage: "start", prerequisites: ["build"], deterministic: true, status: "failed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: false, privateCode: "START_TIMEOUT", summary: "App did not become ready before timeout", score: 0 }, producerRef, evidenceRefs: [log] };
    }
  }
}

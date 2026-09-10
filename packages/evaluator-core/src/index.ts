import { randomUUID } from "node:crypto";
import { validateContractDocument, type FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";

export type EvaluatorStage = "integrity" | "build" | string;
export interface EvaluatorContext {
  runId: string; attemptId: string; ordinal: number; snapshotDigest: string;
  /** Recomputed around every untrusted command by the evaluator host. */
  assertSnapshot(): Promise<void>;
  stageArtifact(input: { logicalType: string; mime: string; relativePath: string; content: string; producerRef: string }): string;
}
export interface EvaluatorPlugin {
  /** `informational` evaluators feed the quality vector only; their crashes become a failed dimension, never a terminal evaluator_error. */
  metadata(): { id: string; version: string; stage: EvaluatorStage; prerequisites?: string[]; deterministic: boolean; informational?: boolean };
  prepare(context: EvaluatorContext): Promise<void>;
  execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult>;
  cleanup(context: EvaluatorContext): Promise<void>;
}
export interface PipelineResult { results: FrontendAgentEvaluatorResult[]; }

function errorResult(plugin: EvaluatorPlugin, context: EvaluatorContext, code: string, summary: string): FrontendAgentEvaluatorResult {
  const meta = plugin.metadata(); const producerRef = `attempt:${context.attemptId}:evaluator:${meta.id}`;
  return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: meta.id, evaluatorVersion: meta.version, attemptId: context.attemptId, stage: meta.stage, prerequisites: meta.prerequisites, deterministic: meta.deterministic, status: "error", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: false, privateCode: code, summary }, producerRef, evidenceRefs: [`evaluator-results/${meta.id}.json`] };
}

/** Ordered, fail-closed evaluator runner. A failed prerequisite is represented as skipped, not an evaluator crash. */
export class EvaluatorPipeline {
  constructor(private readonly plugins: EvaluatorPlugin[]) {}
  async run(context: EvaluatorContext): Promise<PipelineResult> {
    const results: FrontendAgentEvaluatorResult[] = [];
    for (const plugin of this.plugins) {
      const meta = plugin.metadata(); const prerequisites = meta.prerequisites ?? [];
      const unmet = prerequisites.some((id) => results.find((result) => result.evaluatorId === id)?.status !== "passed");
      if (unmet) {
        const producerRef = `attempt:${context.attemptId}:evaluator:${meta.id}`;
        // The staged document must already carry its own self-reference so the on-disk file is schema-valid.
        const relativePath = `evaluator-results/${meta.id}.json`;
        const result: FrontendAgentEvaluatorResult = { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: meta.id, evaluatorVersion: meta.version, attemptId: context.attemptId, stage: meta.stage, prerequisites, deterministic: meta.deterministic, status: "skipped", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: false, privateCode: "PREREQUISITE_NOT_PASSED", summary: "Prerequisite evaluator did not pass" }, producerRef, evidenceRefs: [relativePath] };
        context.stageArtifact({ logicalType: "evaluator_result", mime: "application/json", relativePath, content: JSON.stringify(result), producerRef }); results.push(result); continue;
      }
      let result: FrontendAgentEvaluatorResult;
      try { await plugin.prepare(context); result = await plugin.execute(context); }
      catch (error) { result = errorResult(plugin, context, "EVALUATOR_CRASH", error instanceof Error ? error.message.slice(0, 500) : "Evaluator crashed"); }
      finally { try { await plugin.cleanup(context); } catch {} }
      if (!validateContractDocument(result, "evaluator-result").valid || result.attemptId !== context.attemptId) result = errorResult(plugin, context, "EVALUATOR_RESULT_INVALID", "Evaluator returned an invalid result");
      if (result.evaluatedSnapshotDigest !== context.snapshotDigest) result = errorResult(plugin, context, "SNAPSHOT_DIGEST_CHANGED", "Evaluator reported a different snapshot digest");
      // A snapshot digest change is a security signal and stays terminal even for informational evaluators.
      if (result.status === "error" && meta.informational && result.outcome.privateCode !== "SNAPSHOT_DIGEST_CHANGED") {
        result = { ...result, status: "failed", outcome: { ...result.outcome, passed: false, privateCode: `${meta.id.toUpperCase()}_MEASUREMENT_FAILED`, summary: `Informational evaluator failed: ${result.outcome.summary ?? result.outcome.privateCode}`.slice(0, 500), score: 0 } };
      }
      const relativePath = `evaluator-results/${meta.id}.json`;
      result = { ...result, evidenceRefs: [...new Set([...result.evidenceRefs, relativePath])] };
      context.stageArtifact({ logicalType: "evaluator_result", mime: "application/json", relativePath, content: JSON.stringify(result), producerRef: result.producerRef });
      results.push(result);
    }
    return { results };
  }
}

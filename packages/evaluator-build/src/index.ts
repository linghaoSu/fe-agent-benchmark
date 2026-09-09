import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export const BUILD_STEPS = ["install", "typecheck", "lint", "test", "build"] as const;
type Step = typeof BUILD_STEPS[number];
export class BuildEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { commands: Partial<Record<Step, string>>; run(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> }) {}
  metadata() { return { id: "build", version: "1", stage: "build", prerequisites: ["integrity"], deterministic: true }; }
  async prepare() {}
  async cleanup() {}
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:build`; const evidenceRefs: string[] = [];
    for (const step of BUILD_STEPS) {
      const command = this.input.commands[step]; if (!command) continue;
      await context.assertSnapshot(); const output = await this.input.run(command); await context.assertSnapshot();
      evidenceRefs.push(context.stageArtifact({ logicalType: "build_log", mime: "text/plain", relativePath: `build/${step}.log`, content: `${output.stdout.slice(0, 65536)}${output.stderr.slice(0, 65536)}`, producerRef }));
      if (output.exitCode !== 0) return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "build", evaluatorVersion: "1", attemptId: context.attemptId, stage: "build", prerequisites: ["integrity"], deterministic: true, status: "failed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: false, privateCode: `BUILD_${step.toUpperCase()}_FAILED`, summary: `${step} failed` }, producerRef, evidenceRefs };
    }
    return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "build", evaluatorVersion: "1", attemptId: context.attemptId, stage: "build", prerequisites: ["integrity"], deterministic: true, status: "passed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: true, privateCode: "BUILD_PASSED", summary: "Configured build commands passed", score: 1 }, producerRef, evidenceRefs: evidenceRefs.length ? evidenceRefs : ["evaluator-results/build.json"] };
  }
}

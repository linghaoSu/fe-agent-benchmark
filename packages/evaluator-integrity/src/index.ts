import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export function patchedPaths(patch: string): string[] { return [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]!).filter((path) => path !== "/dev/null"); }
function under(path: string, patterns: string[]) { return patterns.some((pattern) => pattern === "**" || path === pattern.replace(/\/\*\*$/, "") || path.startsWith(`${pattern.replace(/\/\*\*$/, "")}/`)); }
export function integrityCode(patch: string, policy: { writablePaths: string[]; forbiddenPaths: string[]; allowDependencyChanges: boolean }): string | undefined {
  for (const path of patchedPaths(patch)) { if (under(path, policy.forbiddenPaths)) return "INTEGRITY_FORBIDDEN_PATH"; if (!under(path, policy.writablePaths)) return "INTEGRITY_OUTSIDE_WRITABLE_PATH"; if (!policy.allowDependencyChanges && (path === "package.json" || /(^|\/)package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$/.test(path))) return "INTEGRITY_DEPENDENCY_CHANGE"; }
}
export class IntegrityEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { patch: string; policy: { writablePaths: string[]; forbiddenPaths: string[]; allowDependencyChanges: boolean } }) {}
  metadata() { return { id: "integrity", version: "1", stage: "integrity", deterministic: true }; }
  async prepare() {}
  async cleanup() {}
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> { const code = integrityCode(this.input.patch, this.input.policy); const producerRef = `attempt:${context.attemptId}:evaluator:integrity`; const report = JSON.stringify({ paths: patchedPaths(this.input.patch), code: code ?? "INTEGRITY_PASSED" }); const ref = context.stageArtifact({ logicalType: "integrity_report", mime: "application/json", relativePath: "integrity-report.json", content: report, producerRef }); return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "integrity", evaluatorVersion: "1", attemptId: context.attemptId, stage: "integrity", deterministic: true, status: code ? "failed" : "passed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: !code, privateCode: code ?? "INTEGRITY_PASSED", summary: code ?? "Patch policy passed" }, producerRef, evidenceRefs: ["patch.diff", ref] }; }
}

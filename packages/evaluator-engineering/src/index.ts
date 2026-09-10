import { randomUUID } from "node:crypto";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

export type FileKind = "source" | "test" | "dependency" | "generated" | "other";
export interface EngineeringPolicy { writablePaths: string[]; allowDependencyChanges: boolean; }
export interface EngineeringBudget { maxChangedFiles?: number; maxChangedLines?: number; }
export interface PatchFile { path: string; added: number; removed: number; kind: FileKind; }
export interface EngineeringCheck { id: string; passed: boolean; detail: string; }
export interface EngineeringAnalysis { files: PatchFile[]; checks: EngineeringCheck[]; score: number; }

const DEFAULT_BUDGET = { maxChangedFiles: 12, maxChangedLines: 600 };
const SMALL_CHANGE_LINES = 20;
const DETAIL_LIMIT = 200;
const REPORT_FILE_LIMIT = 50;

export function isDependencyPath(path: string): boolean { return path === "package.json" || /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path); }
export function isGeneratedPath(path: string): boolean { return /(^|\/)(dist|build|node_modules|coverage)\//.test(path) || /\.map$|\.min\.js$/.test(path); }
export function isTestPath(path: string): boolean { return /(^|\/)tests?\//.test(path) || /\.(test|spec)\./.test(path); }
export function classifyPath(path: string): FileKind {
  if (isDependencyPath(path)) return "dependency";
  if (isGeneratedPath(path)) return "generated";
  if (isTestPath(path)) return "test";
  return "source";
}

/** Parses a unified diff into per-file line counts plus the raw added lines (without the leading "+"). */
export function parsePatch(patch: string): Array<PatchFile & { addedLines: string[] }> {
  const files: Array<PatchFile & { addedLines: string[] }> = [];
  let current: (PatchFile & { addedLines: string[] }) | undefined;
  let pendingPath: string | undefined;
  // `git diff --binary` emits binary and pure-rename records without ---/+++ headers; register them from the
  // `diff --git a/x b/y` header so they still count toward footprint and generated-output checks.
  let headerPath: string | undefined; let headerRegistered = false;
  const registerHeader = (): void => {
    if (headerPath && !headerRegistered) { current = { path: headerPath, added: 0, removed: 0, kind: classifyPath(headerPath), addedLines: [] }; files.push(current); headerRegistered = true; }
  };
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      current = undefined; pendingPath = undefined; headerRegistered = false;
      const match = /^diff --git (?:"?a\/(.*?)"?) (?:"?b\/(.*?)"?)$/.exec(line);
      headerPath = match?.[2]?.replace(/\\"/g, '"');
      continue;
    }
    if (line.startsWith("GIT binary patch") || line.startsWith("Binary files ") || line.startsWith("rename to ") || line.startsWith("copy to ")) { registerHeader(); if (current && !current.added) current.added = 1; continue; }
    if (line.startsWith("--- ")) { pendingPath = line.slice(4).replace(/^a\//, "").trim(); continue; }
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      const path = target === "/dev/null" ? (pendingPath && pendingPath !== "/dev/null" ? pendingPath : undefined) : target.replace(/^b\//, "");
      if (!path) { current = undefined; continue; }
      if (headerRegistered && current && current.path === path) continue;
      current = { path, added: 0, removed: 0, kind: classifyPath(path), addedLines: [] }; files.push(current); headerRegistered = true; continue;
    }
    if (!current) continue;
    if (line.startsWith("+")) { current.added += 1; current.addedLines.push(line.slice(1)); }
    else if (line.startsWith("-")) current.removed += 1;
  }
  return files;
}

function truncate(text: string, limit = DETAIL_LIMIT): string { return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; }
function hasTestsWritablePath(policy: EngineeringPolicy): boolean { return policy.writablePaths.some((pattern) => pattern === "**" || /(^|\/)tests?(\/|$)/.test(pattern)); }

/**
 * Deterministic engineering-quality checks over a unified diff. Every check has equal weight; score = passed / total.
 * An empty patch trivially passes every check (score 1).
 *
 * `no-hardcoded-test-data` heuristic: in added lines of non-test source files it flags (a) `data-testid` attribute
 * values that look test-generated (contain `test`, `mock`, `fixture`, `dummy`) and (b) the words mock / fixture /
 * dummy / "lorem ipsum" as whole words. It is intentionally simple and may produce false positives; the evaluator is informational.
 */
export function analyzePatch(patch: string, policy: EngineeringPolicy, budget: EngineeringBudget = {}): EngineeringAnalysis {
  const maxChangedFiles = budget.maxChangedFiles ?? DEFAULT_BUDGET.maxChangedFiles;
  const maxChangedLines = budget.maxChangedLines ?? DEFAULT_BUDGET.maxChangedLines;
  const parsed = parsePatch(patch);
  const files: PatchFile[] = parsed.map(({ path, added, removed, kind }) => ({ path, added, removed, kind }));
  const totalLines = files.reduce((sum, file) => sum + file.added + file.removed, 0);
  const checks: EngineeringCheck[] = [];

  const footprintOk = files.length <= maxChangedFiles && totalLines <= maxChangedLines;
  checks.push({ id: "change-footprint", passed: footprintOk, detail: `${files.length}/${maxChangedFiles} files, ${totalLines}/${maxChangedLines} changed lines` });

  const dependencyFiles = files.filter((file) => file.kind === "dependency").map((file) => file.path);
  const dependencyOk = policy.allowDependencyChanges || dependencyFiles.length === 0;
  checks.push({ id: "no-dependency-changes", passed: dependencyOk, detail: dependencyOk ? (policy.allowDependencyChanges ? "dependency changes allowed by task policy" : "no dependency manifest changes") : `dependency manifests changed: ${dependencyFiles.join(", ")}` });

  const generatedFiles = files.filter((file) => file.kind === "generated").map((file) => file.path);
  checks.push({ id: "no-generated-or-build-output", passed: generatedFiles.length === 0, detail: generatedFiles.length ? `generated or build output committed: ${generatedFiles.join(", ")}` : "no generated or build output" });

  const debugPattern = /console\.log\(|\bdebugger;|\b(TODO|FIXME)\b|\.only\(/;
  const debugHits: string[] = [];
  for (const file of parsed) for (const line of file.addedLines) if (debugPattern.test(line)) debugHits.push(`${file.path}: ${line.trim()}`);
  checks.push({ id: "no-debug-leftovers", passed: debugHits.length === 0, detail: debugHits.length ? `${debugHits.length} debug leftover(s): ${debugHits.slice(0, 3).join(" | ")}` : "no console.log/debugger/TODO/FIXME/.only leftovers" });

  const testDataPattern = /data-testid\s*=\s*["'{]?[^"'}\s]*(test|mock|fixture|dummy)[^"'}\s]*|\b(mock|fixture|dummy|lorem ipsum)\b/i;
  const testDataHits: string[] = [];
  for (const file of parsed) { if (file.kind !== "source") continue; for (const line of file.addedLines) if (testDataPattern.test(line)) testDataHits.push(`${file.path}: ${line.trim()}`); }
  checks.push({ id: "no-hardcoded-test-data", passed: testDataHits.length === 0, detail: testDataHits.length ? `${testDataHits.length} fixture-like literal(s) in source: ${testDataHits.slice(0, 3).join(" | ")}` : "no fixture-like literals in non-test source" });

  const sourceChanged = files.some((file) => file.kind === "source");
  const testChanged = files.some((file) => file.kind === "test");
  const testsExpected = sourceChanged && hasTestsWritablePath(policy) && totalLines > SMALL_CHANGE_LINES;
  const testsOk = !testsExpected || testChanged;
  checks.push({ id: "tests-touched-with-source", passed: testsOk, detail: !sourceChanged ? "no source files changed" : !hasTestsWritablePath(policy) ? "task exposes no writable tests/ path" : totalLines <= SMALL_CHANGE_LINES ? `small change (${totalLines} lines) exempt from test requirement` : testChanged ? "source and test files changed together" : `${totalLines} changed source lines without any test file change` });

  const score = files.length === 0 ? 1 : checks.filter((check) => check.passed).length / checks.length;
  return { files, checks: checks.map((check) => ({ ...check, detail: truncate(check.detail) })), score };
}

export class EngineeringEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { patch: string; policy: EngineeringPolicy; budget?: EngineeringBudget }) {}
  metadata() { return { id: "engineering", version: "1", stage: "engineering", prerequisites: ["build"], deterministic: true, informational: true }; }
  async prepare() {}
  async cleanup() {}
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const analysis = analyzePatch(this.input.patch, this.input.policy, this.input.budget);
    const producerRef = `attempt:${context.attemptId}:evaluator:engineering`;
    const report = JSON.stringify({ files: analysis.files.slice(0, REPORT_FILE_LIMIT), totalFiles: analysis.files.length, checks: analysis.checks, score: analysis.score });
    const ref = context.stageArtifact({ logicalType: "engineering_report", mime: "application/json", relativePath: "engineering/report.json", content: report, producerRef });
    const failed = analysis.checks.filter((check) => !check.passed).map((check) => check.id);
    const ok = analysis.score === 1;
    const summary = truncate(ok ? "Engineering quality checks passed" : `Engineering issues: ${failed.join(", ")}`, 500);
    return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "engineering", evaluatorVersion: "1", attemptId: context.attemptId, stage: "engineering", prerequisites: ["build"], deterministic: true, status: ok ? "passed" : "failed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: ok, privateCode: ok ? "ENGINEERING_PASSED" : "ENGINEERING_ISSUES", summary, score: analysis.score }, producerRef, evidenceRefs: this.input.patch ? ["patch.diff", ref] : [ref] };
  }
}

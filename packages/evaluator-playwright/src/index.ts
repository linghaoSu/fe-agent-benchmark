import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FrontendAgentEvaluatorResult } from "@frontend-agent-benchmark/contracts";
import type { EvaluatorContext, EvaluatorPlugin } from "@frontend-agent-benchmark/evaluator-core";

type Case = { id: string; critical: boolean; passed: boolean };
const generic = (id: string, passed: boolean, critical: boolean): Case => ({ id, passed, critical });
export class PlaywrightEvaluator implements EvaluatorPlugin {
  constructor(private readonly input: { hiddenBundlePath: string; port: number; actionTimeoutMs?: number; run(script: string): Promise<{ exitCode: number; stdout: string; stderr: string }> }) {}
  metadata() { return { id: "functional", version: "1", stage: "functional", prerequisites: ["start"], deterministic: true }; }
  async prepare() {}
  async cleanup() {}
  async execute(context: EvaluatorContext): Promise<FrontendAgentEvaluatorResult> {
    const producerRef = `attempt:${context.attemptId}:evaluator:functional`;
    const spec = readFileSync(join(this.input.hiddenBundlePath, "functional.spec.mjs"), "utf8");
    const script = `const src=${JSON.stringify(spec)}; (async()=>{const {chromium}=require('playwright-core');const tests=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;const b=await chromium.launch({headless:true});const p=await b.newPage();p.setDefaultTimeout(${this.input.actionTimeoutMs ?? 15_000});p.setDefaultNavigationTimeout(30_000);const out=[];for(const t of tests){let ok=false;try{await p.goto('http://app:${this.input.port}');ok=await t.run(p)}catch{}out.push({id:t.id,critical:!!t.critical,passed:!!ok})}await b.close();process.stdout.write(JSON.stringify(out))})().catch(()=>process.exit(1));`;
    const raw = await this.input.run(script);
    let cases: Case[] = [];
    try { const value = JSON.parse(raw.stdout); if (Array.isArray(value)) cases = value.filter((x): x is Case => typeof x?.id === "string" && typeof x?.critical === "boolean" && typeof x?.passed === "boolean").map((x) => generic(x.id, x.passed, x.critical)); } catch {}
    const total = cases.length; const passed = cases.filter((x) => x.passed).length; const critical = cases.filter((x) => x.critical); const allCritical = raw.exitCode === 0 && total > 0 && critical.every((x) => x.passed);
    const json = context.stageArtifact({ logicalType: "functional_result", mime: "application/json", relativePath: "functional/tests.json", content: JSON.stringify({ tests: cases.map(({ id, passed: ok, critical: c }) => ({ id, passed: ok, critical: c, message: ok ? "passed" : "failed" })), score: total ? passed / total : 0 }), producerRef });
    const log = context.stageArtifact({ logicalType: "playwright_log", mime: "text/plain", relativePath: "functional/playwright.log", content: `${raw.stdout.slice(0, 65536)}${raw.stderr.slice(0, 65536)}`, producerRef });
    return { schemaVersion: 1, evaluatorResultId: randomUUID(), evaluatorId: "functional", evaluatorVersion: "1", attemptId: context.attemptId, stage: "functional", prerequisites: ["start"], deterministic: true, status: allCritical ? "passed" : "failed", evaluatedSnapshotDigest: context.snapshotDigest, outcome: { passed: allCritical, privateCode: allCritical ? "FUNCTIONAL_PASSED" : "FUNCTIONAL_CRITICAL_FAILED", summary: allCritical ? "Critical functional tests passed" : "Critical functional tests failed", score: total ? passed / total : 0 }, producerRef, evidenceRefs: [json, log] };
  }
}

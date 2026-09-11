/**
 * Dashboard API — a read-only JSON view over every `*.sqlite` under the runs directory and the Artifact trees
 * beside them. Databases are opened `readOnly`, so this process can never run migrations or touch a Run.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

import { summarizeConfiguration, type RunSample } from "@frontend-agent-benchmark/comparison";
import type { FrontendAgentEvaluationResult } from "@frontend-agent-benchmark/contracts";

interface Options { port: number; runsDir: string }

function parseOptions(argv: string[]): Options {
  const options: Options = { port: 8788, runsDir: resolve(process.cwd(), "runs") };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port" && argv[index + 1]) { options.port = Number(argv[index + 1]); index += 1; }
    else if (argv[index] === "--runs-dir" && argv[index + 1]) { options.runsDir = resolve(process.cwd(), argv[index + 1]!); index += 1; }
  }
  return options;
}

type Row = Record<string, unknown>;

class Database {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
  }
  all(sql: string, ...params: Array<string | number>): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  get(sql: string, ...params: Array<string | number>): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
}

function openDatabases(runsDir: string): Database[] {
  if (!existsSync(runsDir)) return [];
  // Databases from before the current schema (e.g. without `results`) are skipped rather than failing every view.
  const REQUIRED_TABLES = ["runs", "attempts", "results", "artifacts", "tool_calls"];
  return readdirSync(runsDir).filter((name) => name.endsWith(".sqlite")).sort().flatMap((name) => {
    try {
      const database = new Database(join(runsDir, name));
      const tables = new Set(database.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name as string));
      if (REQUIRED_TABLES.every((table) => tables.has(table))) return [database];
      database.db.close();
      return [];
    } catch { return []; }
  });
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

interface RunSummary {
  runId: string; db: string; taskId: string; taskVersion: number; seed: number; status: string; createdAt: string; finishedAt: string | null;
  model: string; executionClassification: string | null; solved: boolean | null;
  scores: Record<string, number | null>; quality: number | null; efficiency: FrontendAgentEvaluationResult["efficiency"] | null;
  budgetProfile: string | null; network: string | null; bundleChecksum: string;
  fingerprint: { imageDigest?: string; dependencyCacheSnapshotId?: string; networkPolicyId?: string };
}

const SCORE_NAMES = ["build", "functional", "visual", "responsive", "accessibility", "engineering"] as const;

function summarize(database: Database, run: Row): RunSummary {
  const resolved = parseJson<Record<string, any>>(run.resolved_input_json, {});
  const result = parseJson<FrontendAgentEvaluationResult | undefined>(database.get("SELECT result_json FROM results WHERE run_id = ?", run.run_id as string)?.result_json, undefined);
  const attempt = database.get("SELECT execution_classification FROM attempts WHERE run_id = ? ORDER BY ordinal DESC LIMIT 1", run.run_id as string);
  const extensions = (result?.extensions ?? {}) as Record<string, any>;
  return {
    runId: run.run_id as string, db: basename(database.path), taskId: run.task_id as string, taskVersion: run.task_version as number,
    seed: parseJson<number[]>(run.seed_set, [])[0] ?? 0, status: run.status as string, createdAt: run.created_at as string, finishedAt: (run.finished_at as string | null) ?? null,
    model: typeof extensions.agent?.model === "string" ? extensions.agent.model : "mock",
    executionClassification: (attempt?.execution_classification as string | null) ?? extensions.executionClassification ?? null,
    solved: result ? result.solved : null,
    scores: Object.fromEntries(SCORE_NAMES.map((name) => [name, result?.scores?.[name]?.value ?? null])),
    quality: typeof extensions.quality === "number" ? extensions.quality : null,
    efficiency: result?.efficiency ?? null,
    budgetProfile: typeof resolved.budgetProfile === "string" ? resolved.budgetProfile : null,
    network: typeof resolved.network === "string" ? resolved.network : null,
    bundleChecksum: run.bundle_checksum as string,
    fingerprint: { imageDigest: resolved.sandbox?.imageDigest, dependencyCacheSnapshotId: resolved.dependencyCacheSnapshotId, networkPolicyId: resolved.networkPolicyId },
  };
}

function camel(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value]));
}

function listRuns(databases: Database[], query: URLSearchParams): RunSummary[] {
  const runs = databases.flatMap((database) => database.all("SELECT * FROM runs").map((run) => summarize(database, run)));
  return runs
    .filter((run) => !query.get("task") || run.taskId === query.get("task"))
    .filter((run) => !query.get("model") || run.model === query.get("model"))
    .filter((run) => !query.get("status") || run.status === query.get("status"))
    .filter((run) => !query.get("db") || run.db === query.get("db"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function locate(databases: Database[], runId: string): { database: Database; run: Row } | undefined {
  for (const database of databases) {
    const run = database.get("SELECT * FROM runs WHERE run_id = ?", runId);
    if (run) return { database, run };
  }
  return undefined;
}

function attemptDirectory(database: Database, runId: string, ordinal: number): string {
  return join(resolve(database.path, ".."), runId, "attempts", String(ordinal));
}

function readJsonFiles(directory: string): Record<string, unknown> {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => [name.replace(/\.json$/, ""), parseJson(readFileSync(join(directory, name), "utf8"), null)]));
}

function showRun(databases: Database[], runId: string): Record<string, unknown> | undefined {
  const located = locate(databases, runId);
  if (!located) return undefined;
  const { database, run } = located;
  const attempts = database.all("SELECT * FROM attempts WHERE run_id = ? ORDER BY ordinal", runId);
  const attemptIds = attempts.map((attempt) => attempt.attempt_id as string);
  const forAttempts = (table: string, order: string) => attemptIds.flatMap((attemptId) => database.all(`SELECT * FROM ${table} WHERE attempt_id = ? ORDER BY ${order}`, attemptId));
  const last = attempts.at(-1);
  const directory = last ? attemptDirectory(database, runId, last.ordinal as number) : undefined;
  const functionalTests = directory && existsSync(join(directory, "functional", "tests.json")) ? parseJson(readFileSync(join(directory, "functional", "tests.json"), "utf8"), null) : null;
  const events = directory && existsSync(join(directory, "agent-events.jsonl"))
    ? readFileSync(join(directory, "agent-events.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => parseJson(line, null)).filter(Boolean)
    : [];
  return {
    summary: summarize(database, run),
    run: camel(run),
    transitions: database.all("SELECT * FROM run_transitions WHERE run_id = ? ORDER BY seq", runId).map(camel),
    attempts: attempts.map(camel),
    attemptTransitions: forAttempts("transitions", "seq").map(camel),
    producerRecords: forAttempts("producer_records", "producer_id").map(camel),
    toolCalls: forAttempts("tool_calls", "seq").map((row) => ({ ...camel(row), truncated: row.truncated === 1 })),
    artifacts: forAttempts("artifacts", "relative_path").map(camel),
    manifests: forAttempts("manifests", "attempt_id").map(camel),
    result: database.get("SELECT * FROM results WHERE run_id = ?", runId),
    evaluators: directory ? readJsonFiles(join(directory, "evaluator-results")) : {},
    functionalTests,
    visual: directory ? readJsonFiles(join(directory, "visual")) : {},
    events,
  };
}

/** Serves one finalized Artifact of the last Attempt; the path must be listed in the artifacts table. */
function serveArtifact(databases: Database[], runId: string, relativePath: string, format: string | null, response: ServerResponse): void {
  const located = locate(databases, runId);
  const last = located?.database.get("SELECT attempt_id, ordinal FROM attempts WHERE run_id = ? ORDER BY ordinal DESC LIMIT 1", runId);
  if (!located || !last) return json(response, 404, { error: "RUN_NOT_FOUND" });
  const artifact = located.database.get("SELECT mime FROM artifacts WHERE attempt_id = ? AND relative_path = ? AND status = 'finalized'", last.attempt_id as string, relativePath);
  const directory = attemptDirectory(located.database, runId, last.ordinal as number);
  const target = resolve(directory, relativePath);
  const inside = relative(directory, target);
  if (!artifact || !inside || inside.startsWith("..") || inside.startsWith(sep)) return json(response, 404, { error: "ARTIFACT_NOT_FOUND" });
  if (!existsSync(target) || !statSync(target).isFile()) return json(response, 404, { error: "ARTIFACT_NOT_FOUND" });
  if (format === "png" && relativePath.endsWith(".png.json")) {
    const screenshot = parseJson<{ pngBase64?: string }>(readFileSync(target, "utf8"), {});
    if (!screenshot.pngBase64) return json(response, 404, { error: "ARTIFACT_NOT_FOUND" });
    response.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" });
    response.end(Buffer.from(screenshot.pngBase64, "base64"));
    return;
  }
  response.writeHead(200, { "content-type": `${artifact.mime as string}; charset=utf-8`, "access-control-allow-origin": "*" });
  response.end(readFileSync(target));
}

function listTasks(databases: Database[]): unknown[] {
  const runs = listRuns(databases, new URLSearchParams());
  const tasks = new Map<string, { taskId: string; runs: number; byModel: Record<string, { runs: number; solved: number }> }>();
  for (const run of runs) {
    const task = tasks.get(run.taskId) ?? { taskId: run.taskId, runs: 0, byModel: {} };
    task.runs += 1;
    const model = task.byModel[run.model] ?? { runs: 0, solved: 0 };
    model.runs += 1; if (run.solved) model.solved += 1;
    task.byModel[run.model] = model;
    tasks.set(run.taskId, task);
  }
  return [...tasks.values()].sort((a, b) => a.taskId.localeCompare(b.taskId));
}

/** `config=<label>=<model>` groups a task's Runs by model; `config=<label>=<runId,runId>` picks explicit Runs. */
function compare(databases: Database[], query: URLSearchParams): unknown {
  const taskId = query.get("task");
  const k = Number(query.get("k") ?? 0) || undefined;
  const runs = listRuns(databases, new URLSearchParams(taskId ? { task: taskId } : {}));
  const configurations = query.getAll("config").map((entry) => {
    const [label, selector = ""] = entry.split("=", 2) as [string, string?];
    const ids = new Set(selector.split(","));
    const selected = runs.filter((run) => run.model === selector || ids.has(run.runId)).sort((a, b) => a.seed - b.seed);
    const samples: RunSample[] = selected.map((run) => ({
      runId: run.runId, seed: run.seed, status: run.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      result: parseJson<FrontendAgentEvaluationResult | undefined>(locate(databases, run.runId)!.database.get("SELECT result_json FROM results WHERE run_id = ?", run.runId)?.result_json, undefined),
      finalClassification: run.executionClassification ?? "infrastructure_error",
      attempts: Number(locate(databases, run.runId)!.database.get("SELECT COUNT(*) AS n FROM attempts WHERE run_id = ?", run.runId)?.n ?? 1),
    }));
    const fingerprints = new Set(selected.map((run) => `${run.taskId}@${run.taskVersion}|${run.fingerprint.imageDigest ?? ""}|${run.fingerprint.dependencyCacheSnapshotId ?? ""}|${run.network ?? ""}`));
    return {
      configurationId: label, runs: selected.map((run) => ({ runId: run.runId, seed: run.seed, solved: run.solved, status: run.status })),
      summary: samples.length ? summarizeConfiguration({ configurationId: label, runs: samples }, k && k <= samples.length ? k : samples.length) : null,
      meanInputTokens: mean(selected.map((run) => run.efficiency?.inputTokens ?? 0)), meanOutputTokens: mean(selected.map((run) => run.efficiency?.outputTokens ?? 0)),
      comparable: fingerprints.size <= 1, fingerprints: [...fingerprints],
    };
  });
  return { taskId, k, configurations };
}

function mean(values: number[]): number { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0; }

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  response.end(JSON.stringify(body));
}

export function handle(runsDir: string, request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://localhost");
  const databases = openDatabases(runsDir);
  try {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api") return json(response, 404, { error: "NOT_FOUND" });
    if (parts[1] === "health") return json(response, 200, { ok: true, databases: databases.map((database) => ({ path: basename(database.path), runs: Number(database.get("SELECT COUNT(*) AS n FROM runs")?.n ?? 0) })) });
    if (parts[1] === "tasks") return json(response, 200, listTasks(databases));
    if (parts[1] === "compare") return json(response, 200, compare(databases, url.searchParams));
    if (parts[1] === "runs" && parts.length === 2) return json(response, 200, listRuns(databases, url.searchParams));
    if (parts[1] === "runs" && parts.length === 3) {
      const shown = showRun(databases, parts[2]!);
      return shown ? json(response, 200, shown) : json(response, 404, { error: "RUN_NOT_FOUND" });
    }
    if (parts[1] === "runs" && parts[3] === "artifacts" && parts.length > 4) {
      return serveArtifact(databases, parts[2]!, decodeURIComponent(parts.slice(4).join("/")), url.searchParams.get("format"), response);
    }
    json(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    json(response, 500, { error: "INTERNAL", message: error instanceof Error ? error.message : String(error) });
  } finally {
    for (const database of databases) database.db.close();
  }
}

if (process.argv[1] && basename(process.argv[1]) === "index.js") {
  const options = parseOptions(process.argv.slice(2));
  createServer((request, response) => handle(options.runsDir, request, response)).listen(options.port, () => {
    console.log(JSON.stringify({ listening: options.port, runsDir: options.runsDir }));
  });
}

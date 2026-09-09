import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  source: string;
  checksum: string;
}

interface MigrationRow {
  version: number;
  checksum: string;
}

const initialMigration = readFileSync(
  new URL("../migrations/001_initial.sql", import.meta.url),
  "utf8",
);
const attemptLifecycleMigration = readFileSync(
  new URL("../migrations/002_attempt_lifecycle.sql", import.meta.url),
  "utf8",
);
const leasesArtifactsResultsMigration = readFileSync(
  new URL("../migrations/003_leases_artifacts_results.sql", import.meta.url),
  "utf8",
);
const exportsMigration = readFileSync(
  new URL("../migrations/004_exports.sql", import.meta.url),
  "utf8",
);
const adapterFramesMigration = readFileSync(
  new URL("../migrations/005_adapter_frames.sql", import.meta.url),
  "utf8",
);
const toolCallsMigration = readFileSync(
  new URL("../migrations/006_tool_calls.sql", import.meta.url),
  "utf8",
);
const attemptNetworkMigration = readFileSync(
  new URL("../migrations/007_attempt_network.sql", import.meta.url),
  "utf8",
);
const submissionSnapshotMigration = readFileSync(
  new URL("../migrations/008_submission_snapshot.sql", import.meta.url),
  "utf8",
);
const migrations: Migration[] = [
  {
    version: 1,
    source: initialMigration,
    checksum: sha256(initialMigration),
  },
  {
    version: 2,
    source: attemptLifecycleMigration,
    checksum: sha256(attemptLifecycleMigration),
  },
  {
    version: 3,
    source: leasesArtifactsResultsMigration,
    checksum: sha256(leasesArtifactsResultsMigration),
  },
  {
    version: 4,
    source: exportsMigration,
    checksum: sha256(exportsMigration),
  },
  {
    version: 5,
    source: adapterFramesMigration,
    checksum: sha256(adapterFramesMigration),
  },
  {
    version: 6,
    source: toolCallsMigration,
    checksum: sha256(toolCallsMigration),
  },
  { version: 7, source: attemptNetworkMigration, checksum: sha256(attemptNetworkMigration) },
  { version: 8, source: submissionSnapshotMigration, checksum: sha256(submissionSnapshotMigration) },
];

export const EXECUTION_LEASE_NAME = "global-executor";
export const MIGRATION_LEASE_NAME = "schema-migration";
const CURRENT_PROCESS_STARTED_AT = new Date(
  Math.floor((Date.now() - process.uptime() * 1_000) / 1_000) * 1_000,
).toISOString();

export class StateStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StateStoreError";
  }
}

export interface RegisterTaskInput {
  taskId: string;
  version: number;
  bundleChecksum: string;
  schemaVersion: number;
  path: string;
}

export interface TaskRecord extends RegisterTaskInput {}

export interface TaskRepository {
  register(input: RegisterTaskInput): TaskRecord;
  find(taskId: string, version: number): TaskRecord | undefined;
}

export interface CreateRunInput {
  runId: string;
  inputHash: string;
  resolvedInputJson: string;
  inputJsonChecksum: string;
  taskId: string;
  taskVersion: number;
  bundleChecksum: string;
  seedSet: number[];
  budgetsJson: string;
  dependencyLockHash: string | null;
  dependencyCacheSnapshotId: string | null;
  createdAt: string;
  transitionReason: string;
}

export type RunStatus =
  | "CREATED"
  | "PREFLIGHT"
  | "ATTEMPT_ACTIVE"
  | "AGGREGATING"
  | "COMPLETED"
  | "FAILED";

export type AttemptLifecycleStatus =
  | "CREATED"
  | "SANDBOX_STARTING"
  | "AGENT_RUNNING"
  | "AGENT_STOPPING"
  | "WORKSPACE_FROZEN"
  | "EVALUATING"
  | "FINALIZING"
  | "FAILED"
  | "SUCCEEDED";

export type AgentOutcome =
  | "not_started"
  | "completed"
  | "adapter_error"
  | "model_error"
  | "budget_exhausted"
  | "cancelled";

export type ExecutionClassification =
  | "completed"
  | "agent_failure"
  | "budget_exhausted"
  | "invalid"
  | "infrastructure_error"
  | "evaluator_error";

export type TerminationPhase = "sandbox_starting" | "agent" | "evaluation";
export type ProducerKind = "evaluator" | "policy" | "adapter" | "budget" | "infrastructure";

export interface RunRecord {
  runId: string;
  inputHash: string;
  resolvedInputJson: string;
  inputJsonChecksum: string;
  status: RunStatus;
  createdAt: string;
  finishedAt: string | null;
  taskId: string;
  taskVersion: number;
  bundleChecksum: string;
  seedSet: number[];
  budgetsJson: string;
  dependencyLockHash: string | null;
  dependencyCacheSnapshotId: string | null;
}

export interface RunTransition {
  runId: string;
  seq: number;
  fromState: string;
  toState: string;
  reason: string;
  at: string;
}

export interface RunRepository {
  create(input: CreateRunInput): RunRecord;
  find(runId: string): RunRecord | undefined;
  transitions(runId: string): RunTransition[];
  transition(input: {
    runId: string;
    fromState: RunStatus;
    toState: RunStatus;
    reason: string;
    at: string;
    finishedAt?: string;
  }): RunRecord;
}

export interface AttemptRecord {
  attemptId: string;
  runId: string;
  ordinal: number;
  seed: number;
  lifecycleStatus: AttemptLifecycleStatus;
  agentOutcome: AgentOutcome;
  terminationCause: string | null;
  terminationPhase: TerminationPhase | null;
  executionClassification: ExecutionClassification | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
  agentNetworkId: string | null;
  submissionSnapshotDigest: string | null;
}

export interface AttemptTransition {
  attemptId: string;
  seq: number;
  fromState: AttemptLifecycleStatus;
  toState: AttemptLifecycleStatus;
  reason: string;
  at: string;
}

export interface CreateProducerRecordInput {
  producerId: string;
  attemptId: string;
  kind: ProducerKind;
  phase: string;
  privateCode: string;
  boundedSummary: string;
  artifactRefs: string[];
}

export interface ProducerRecord extends CreateProducerRecordInput {}

export interface AttemptRepository {
  create(input: {
    attemptId: string;
    runId: string;
    ordinal: number;
    seed: number;
    createdAt: string;
  }): AttemptRecord;
  find(attemptId: string): AttemptRecord | undefined;
  list(runId: string): AttemptRecord[];
  transitions(attemptId: string): AttemptTransition[];
  transition(input: {
    attemptId: string;
    fromState: AttemptLifecycleStatus;
    toState: AttemptLifecycleStatus;
    reason: string;
    at: string;
    terminal?: {
      executionClassification: ExecutionClassification;
      terminationCause: string | null;
      terminationPhase: TerminationPhase | null;
      failureCode: string | null;
      finishedAt: string;
    };
    producer?: CreateProducerRecordInput;
  }): AttemptRecord;
  setAgentOutcome(
    attemptId: string,
    outcome: Exclude<AgentOutcome, "not_started">,
    producer?: CreateProducerRecordInput,
  ): AttemptRecord;
  setAgentNetworkId(attemptId: string, agentNetworkId: string): AttemptRecord;
  setSubmissionSnapshotDigest(attemptId: string, submissionSnapshotDigest: string): AttemptRecord;
}

export interface ProducerRepository {
  create(input: CreateProducerRecordInput): ProducerRecord;
  forRun(runId: string): ProducerRecord[];
}

export type AdapterFrameDirection = "adapter_to_coordinator" | "coordinator_to_adapter";

export interface AdapterFrameRecord {
  attemptId: string;
  direction: AdapterFrameDirection;
  seq: number;
  type: string;
  frameJson: string;
  receivedAt: string;
}

export interface AdapterFrameRepository {
  append(record: AdapterFrameRecord): AdapterFrameRecord;
  forAttempt(attemptId: string): AdapterFrameRecord[];
}

export interface ToolCallRecord {
  attemptId: string;
  seq: number;
  tool: string;
  argumentsJson: string;
  status: "accepted" | "completed";
  outcomeCode: string | null;
  outputBytes: number;
  truncated: boolean;
  artifactRef: string | null;
  acceptedAt: string;
  executedAt: string | null;
}

export interface ToolCallRepository {
  accept(record: {
    attemptId: string;
    seq: number;
    tool: string;
    argumentsJson: string;
    acceptedAt: string;
  }): ToolCallRecord;
  complete(record: {
    attemptId: string;
    seq: number;
    outcomeCode: string;
    outputBytes: number;
    truncated: boolean;
    artifactRef: string | null;
    executedAt: string;
  }): ToolCallRecord;
  forAttempt(attemptId: string): ToolCallRecord[];
}

export interface LeaseOwner {
  ownerUuid: string;
  ownerPid: number;
  ownerPidStartedAt: string;
}

export interface ExecutionLeaseRecord extends LeaseOwner {
  leaseName: string;
  heartbeatAt: string;
  acquiredAt: string;
}

export interface LeaseRepository {
  acquire(leaseName: string, owner: LeaseOwner): ExecutionLeaseRecord;
  find(leaseName: string): ExecutionLeaseRecord | undefined;
  heartbeat(leaseName: string, owner: LeaseOwner): ExecutionLeaseRecord;
  release(leaseName: string, owner: LeaseOwner): void;
}

export type ArtifactStatus = "staged" | "finalized";
export type ArtifactAudience = "maintainer_only" | "requester_safe";

export interface ArtifactRecord {
  attemptId: string;
  logicalType: string;
  mime: string;
  relativePath: string;
  checksum: string;
  size: number;
  status: ArtifactStatus;
  audience: ArtifactAudience;
  createdAt: string;
}

export interface ManifestRecord {
  attemptId: string;
  manifestChecksum: string;
  finalizedAt: string;
}

export interface ArtifactRepository {
  finalizeAttempt(input: {
    attemptId: string;
    manifestChecksum: string;
    finalizedAt: string;
    artifacts: ArtifactRecord[];
  }): ManifestRecord;
  forRun(runId: string): ArtifactRecord[];
}

export interface ManifestRepository {
  find(attemptId: string): ManifestRecord | undefined;
  forRun(runId: string): ManifestRecord[];
}

export interface ResultRecord {
  runId: string;
  resultJson: string;
  resultChecksum: string;
  createdAt: string;
}

export interface ResultRepository {
  create(record: ResultRecord): ResultRecord;
  find(runId: string): ResultRecord | undefined;
}

export type ExportOutcome = "passed" | "EXPORT_POLICY_DENIED";

export interface ExportRecord {
  exportId: string;
  runId: string;
  audience: "requester";
  publicResultChecksum: string | null;
  manifestHash: string | null;
  publicCodePolicyVersion: number;
  policyVersion: number;
  createdAt: string;
  outcome: ExportOutcome;
  failureCode: string | null;
}

export interface ExportRepository {
  create(record: ExportRecord): ExportRecord;
  find(exportId: string): ExportRecord | undefined;
  forRun(runId: string): ExportRecord[];
}

export interface StateStore {
  databasePath: string;
  tasks: TaskRepository;
  runs: RunRepository;
  attempts: AttemptRepository;
  producers: ProducerRepository;
  adapterFrames: AdapterFrameRepository;
  toolCalls: ToolCallRepository;
  leases: LeaseRepository;
  artifacts: ArtifactRepository;
  manifests: ManifestRepository;
  results: ResultRepository;
  exports: ExportRepository;
  close(): void;
}

interface TaskRow {
  task_id: string;
  version: number;
  bundle_checksum: string;
  schema_version: number;
  path: string;
}

interface RunRow {
  run_id: string;
  input_hash: string;
  resolved_input_json: string;
  input_json_checksum: string;
  status: RunStatus;
  created_at: string;
  finished_at: string | null;
  task_id: string;
  task_version: number;
  bundle_checksum: string;
  seed_set: string;
  budgets_json: string;
  dependency_lock_hash: string | null;
  dependency_cache_snapshot_id: string | null;
}

interface TransitionRow {
  run_id: string;
  seq: number;
  from_state: string;
  to_state: string;
  reason: string;
  at: string;
}

interface AttemptRow {
  attempt_id: string;
  run_id: string;
  ordinal: number;
  seed: number;
  lifecycle_status: AttemptLifecycleStatus;
  agent_outcome: AgentOutcome;
  termination_cause: string | null;
  termination_phase: TerminationPhase | null;
  execution_classification: ExecutionClassification | null;
  failure_code: string | null;
  created_at: string;
  finished_at: string | null;
  agent_network_id: string | null;
  submission_snapshot_digest: string | null;
}

interface AttemptTransitionRow {
  attempt_id: string;
  seq: number;
  from_state: AttemptLifecycleStatus;
  to_state: AttemptLifecycleStatus;
  reason: string;
  at: string;
}

interface ProducerRow {
  producer_id: string;
  attempt_id: string;
  kind: ProducerKind;
  phase: string;
  private_code: string;
  bounded_summary: string;
  artifact_refs_json: string;
}

interface AdapterFrameRow {
  attempt_id: string;
  direction: AdapterFrameDirection;
  seq: number;
  type: string;
  frame_json: string;
  received_at: string;
}

interface ToolCallRow {
  attempt_id: string;
  seq: number;
  tool: string;
  arguments_json: string;
  status: "accepted" | "completed";
  outcome_code: string | null;
  output_bytes: number;
  truncated: number;
  artifact_ref: string | null;
  accepted_at: string;
  executed_at: string | null;
}

interface LeaseRow {
  lease_name: string;
  owner_uuid: string;
  owner_pid: number;
  owner_pid_started_at: string;
  heartbeat_at: string;
  acquired_at: string;
}

interface ArtifactRow {
  attempt_id: string;
  logical_type: string;
  mime: string;
  relative_path: string;
  checksum: string;
  size: number;
  status: ArtifactStatus;
  audience: ArtifactAudience;
  created_at: string;
}

interface ManifestRow {
  attempt_id: string;
  manifest_checksum: string;
  finalized_at: string;
}

interface ResultRow {
  run_id: string;
  result_json: string;
  result_checksum: string;
  created_at: string;
}

interface ExportRow {
  export_id: string;
  run_id: string;
  audience: "requester";
  public_result_checksum: string | null;
  manifest_hash: string | null;
  public_code_policy_version: number;
  policy_version: number;
  created_at: string;
  outcome: ExportOutcome;
  failure_code: string | null;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hasMigrationTable(database: DatabaseSync): boolean {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get() !== undefined;
}

function readAppliedMigrations(database: DatabaseSync): MigrationRow[] {
  if (!hasMigrationTable(database)) return [];
  return database.prepare(
    "SELECT version, checksum FROM schema_migrations ORDER BY version",
  ).all() as unknown as MigrationRow[];
}

function validateMigrationHistory(applied: MigrationRow[]): void {
  const latestVersion = migrations.at(-1)!.version;
  for (const row of applied) {
    const known = migrations.find((migration) => migration.version === row.version);
    if (!known) {
      throw new StateStoreError(
        row.version > latestVersion ? "MIGRATION_UNKNOWN_NEWER" : "MIGRATION_HISTORY_INVALID",
        `Database migration ${row.version} is not known to this binary`,
      );
    }
    if (known.checksum !== row.checksum) {
      throw new StateStoreError(
        "MIGRATION_CHECKSUM_MISMATCH",
        `Database migration ${row.version} checksum does not match this binary`,
      );
    }
  }
}

function backupName(databasePath: string): string {
  const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  return `${databasePath}.${timestamp}.bak`;
}

function processStartIdentity(pid: number): string | undefined {
  if (pid === process.pid) return CURRENT_PROCESS_STARTED_AT;
  try {
    const value = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  } catch {
    return undefined;
  }
}

function inspectProcess(pid: number): { alive: false } | { alive: true; startedAt?: string } {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { alive: false };
    return { alive: true };
  }
  const startedAt = processStartIdentity(pid);
  return startedAt ? { alive: true, startedAt } : { alive: true };
}

function hasExecutionLeaseTable(database: DatabaseSync): boolean {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'execution_leases'",
  ).get() !== undefined;
}

function staleLease(row: LeaseRow): boolean {
  const processState = inspectProcess(row.owner_pid);
  return !processState.alive
    || (processState.startedAt !== undefined
      && processState.startedAt !== row.owner_pid_started_at);
}

function acquireMigrationLease(database: DatabaseSync, owner: LeaseOwner): void {
  for (const leaseName of [EXECUTION_LEASE_NAME, MIGRATION_LEASE_NAME]) {
    const existing = database.prepare(
      "SELECT * FROM execution_leases WHERE lease_name = ?",
    ).get(leaseName) as unknown as LeaseRow | undefined;
    if (!existing) continue;
    if (!staleLease(existing)) {
      throw new StateStoreError(
        "MIGRATION_LEASE_HELD",
        `Cannot migrate while live lease ${leaseName} is held`,
      );
    }
    database.prepare("DELETE FROM execution_leases WHERE lease_name = ?").run(leaseName);
  }
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO execution_leases (
      lease_name, owner_uuid, owner_pid, owner_pid_started_at, heartbeat_at, acquired_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    MIGRATION_LEASE_NAME,
    owner.ownerUuid,
    owner.ownerPid,
    owner.ownerPidStartedAt,
    now,
    now,
  );
}

export function currentProcessOwner(): LeaseOwner {
  const ownerPidStartedAt = processStartIdentity(process.pid);
  if (!ownerPidStartedAt) {
    throw new StateStoreError(
      "PROCESS_IDENTITY_UNAVAILABLE",
      `Cannot determine start identity for PID ${process.pid}`,
    );
  }
  return { ownerUuid: randomUUID(), ownerPid: process.pid, ownerPidStartedAt };
}

function migrate(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), { recursive: true });
  const existed = existsSync(databasePath);
  let database = new DatabaseSync(databasePath);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    const applied = readAppliedMigrations(database);
    validateMigrationHistory(applied);
    const appliedVersions = new Set(applied.map(({ version }) => version));
    const pending = migrations.filter(({ version }) => !appliedVersions.has(version));

    if (pending.length > 0 && existed) {
      database.close();
      copyFileSync(databasePath, backupName(databasePath), constants.COPYFILE_EXCL);
      database = new DatabaseSync(databasePath);
      database.exec("PRAGMA busy_timeout = 5000;");
    }

    for (const migration of pending) {
      // SQLite's exclusive transaction is the migration lease while bootstrapping
      // execution_leases in migration 3; later migrations inherit the same lock.
      database.exec("BEGIN EXCLUSIVE");
      try {
        const owner = currentProcessOwner();
        let migrationLeaseHeld = false;
        if (hasExecutionLeaseTable(database)) {
          acquireMigrationLease(database, owner);
          migrationLeaseHeld = true;
        }
        database.exec(migration.source);
        if (!migrationLeaseHeld && hasExecutionLeaseTable(database)) {
          acquireMigrationLease(database, owner);
          migrationLeaseHeld = true;
        }
        database.prepare(
          "INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)",
        ).run(migration.version, new Date().toISOString(), migration.checksum);
        if (migrationLeaseHeld) {
          database.prepare(`
            DELETE FROM execution_leases
            WHERE lease_name = ? AND owner_uuid = ?
          `).run(MIGRATION_LEASE_NAME, owner.ownerUuid);
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }

    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    return database;
  } catch (error) {
    try {
      database.close();
    } catch {}
    throw error;
  }
}

function taskRecord(row: TaskRow): TaskRecord {
  return {
    taskId: row.task_id,
    version: row.version,
    bundleChecksum: row.bundle_checksum,
    schemaVersion: row.schema_version,
    path: row.path,
  };
}

function runRecord(row: RunRow): RunRecord {
  return {
    runId: row.run_id,
    inputHash: row.input_hash,
    resolvedInputJson: row.resolved_input_json,
    inputJsonChecksum: row.input_json_checksum,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    taskId: row.task_id,
    taskVersion: row.task_version,
    bundleChecksum: row.bundle_checksum,
    seedSet: JSON.parse(row.seed_set) as number[],
    budgetsJson: row.budgets_json,
    dependencyLockHash: row.dependency_lock_hash,
    dependencyCacheSnapshotId: row.dependency_cache_snapshot_id,
  };
}

function attemptRecord(row: AttemptRow): AttemptRecord {
  return {
    attemptId: row.attempt_id,
    runId: row.run_id,
    ordinal: row.ordinal,
    seed: row.seed,
    lifecycleStatus: row.lifecycle_status,
    agentOutcome: row.agent_outcome,
    terminationCause: row.termination_cause,
    terminationPhase: row.termination_phase,
    executionClassification: row.execution_classification,
    failureCode: row.failure_code,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    agentNetworkId: row.agent_network_id,
    submissionSnapshotDigest: row.submission_snapshot_digest,
  };
}

function producerRecord(row: ProducerRow): ProducerRecord {
  return {
    producerId: row.producer_id,
    attemptId: row.attempt_id,
    kind: row.kind,
    phase: row.phase,
    privateCode: row.private_code,
    boundedSummary: row.bounded_summary,
    artifactRefs: JSON.parse(row.artifact_refs_json) as string[],
  };
}

function adapterFrameRecord(row: AdapterFrameRow): AdapterFrameRecord {
  return {
    attemptId: row.attempt_id,
    direction: row.direction,
    seq: row.seq,
    type: row.type,
    frameJson: row.frame_json,
    receivedAt: row.received_at,
  };
}

function toolCallRecord(row: ToolCallRow): ToolCallRecord {
  return {
    attemptId: row.attempt_id,
    seq: row.seq,
    tool: row.tool,
    argumentsJson: row.arguments_json,
    status: row.status,
    outcomeCode: row.outcome_code,
    outputBytes: row.output_bytes,
    truncated: row.truncated === 1,
    artifactRef: row.artifact_ref,
    acceptedAt: row.accepted_at,
    executedAt: row.executed_at,
  };
}

function leaseRecord(row: LeaseRow): ExecutionLeaseRecord {
  return {
    leaseName: row.lease_name,
    ownerUuid: row.owner_uuid,
    ownerPid: row.owner_pid,
    ownerPidStartedAt: row.owner_pid_started_at,
    heartbeatAt: row.heartbeat_at,
    acquiredAt: row.acquired_at,
  };
}

function artifactRecord(row: ArtifactRow): ArtifactRecord {
  return {
    attemptId: row.attempt_id,
    logicalType: row.logical_type,
    mime: row.mime,
    relativePath: row.relative_path,
    checksum: row.checksum,
    size: row.size,
    status: row.status,
    audience: row.audience,
    createdAt: row.created_at,
  };
}

function manifestRecord(row: ManifestRow): ManifestRecord {
  return {
    attemptId: row.attempt_id,
    manifestChecksum: row.manifest_checksum,
    finalizedAt: row.finalized_at,
  };
}

function resultRecord(row: ResultRow): ResultRecord {
  return {
    runId: row.run_id,
    resultJson: row.result_json,
    resultChecksum: row.result_checksum,
    createdAt: row.created_at,
  };
}

function exportRecord(row: ExportRow): ExportRecord {
  return {
    exportId: row.export_id,
    runId: row.run_id,
    audience: row.audience,
    publicResultChecksum: row.public_result_checksum,
    manifestHash: row.manifest_hash,
    publicCodePolicyVersion: row.public_code_policy_version,
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    outcome: row.outcome,
    failureCode: row.failure_code,
  };
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function insertProducer(database: DatabaseSync, input: CreateProducerRecordInput): void {
  database.prepare(`
    INSERT INTO producer_records (
      producer_id, attempt_id, kind, phase, private_code, bounded_summary, artifact_refs_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.producerId,
    input.attemptId,
    input.kind,
    input.phase,
    input.privateCode,
    input.boundedSummary,
    JSON.stringify(input.artifactRefs),
  );
}

class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  find(taskId: string, version: number): TaskRecord | undefined {
    const row = this.database.prepare(
      "SELECT task_id, version, bundle_checksum, schema_version, path FROM tasks WHERE task_id = ? AND version = ?",
    ).get(taskId, version) as unknown as TaskRow | undefined;
    return row ? taskRecord(row) : undefined;
  }

  register(input: RegisterTaskInput): TaskRecord {
    const existing = this.find(input.taskId, input.version);
    if (existing) {
      if (existing.bundleChecksum !== input.bundleChecksum) {
        throw new StateStoreError(
          "TASK_VERSION_CHECKSUM_MISMATCH",
          `Task ${input.taskId}@${input.version} is already registered with a different checksum`,
        );
      }
      return existing;
    }

    this.database.prepare(`
      INSERT INTO tasks (task_id, version, bundle_checksum, schema_version, path)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.taskId,
      input.version,
      input.bundleChecksum,
      input.schemaVersion,
      input.path,
    );
    return input;
  }
}

class SqliteRunRepository implements RunRepository {
  constructor(private readonly database: DatabaseSync) {}

  find(runId: string): RunRecord | undefined {
    const row = this.database.prepare("SELECT * FROM runs WHERE run_id = ?")
      .get(runId) as unknown as RunRow | undefined;
    return row ? runRecord(row) : undefined;
  }

  transitions(runId: string): RunTransition[] {
    const rows = this.database.prepare(
      "SELECT run_id, seq, from_state, to_state, reason, at FROM run_transitions WHERE run_id = ? ORDER BY seq",
    ).all(runId) as unknown as TransitionRow[];
    return rows.map((row) => ({
      runId: row.run_id,
      seq: row.seq,
      fromState: row.from_state,
      toState: row.to_state,
      reason: row.reason,
      at: row.at,
    }));
  }

  create(input: CreateRunInput): RunRecord {
    transaction(this.database, () => {
      this.database.prepare(`
        INSERT INTO runs (
          run_id, input_hash, resolved_input_json, input_json_checksum, status,
          created_at, finished_at, task_id, task_version, bundle_checksum,
          seed_set, budgets_json, dependency_lock_hash, dependency_cache_snapshot_id
        ) VALUES (?, ?, ?, ?, 'PREFLIGHT', ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.runId,
        input.inputHash,
        input.resolvedInputJson,
        input.inputJsonChecksum,
        input.createdAt,
        input.taskId,
        input.taskVersion,
        input.bundleChecksum,
        JSON.stringify(input.seedSet),
        input.budgetsJson,
        input.dependencyLockHash,
        input.dependencyCacheSnapshotId,
      );
      this.database.prepare(`
        INSERT INTO run_transitions (run_id, seq, from_state, to_state, reason, at)
        VALUES (?, 1, 'CREATED', 'PREFLIGHT', ?, ?)
      `).run(input.runId, input.transitionReason, input.createdAt);
    });

    return this.find(input.runId)!;
  }

  transition(input: {
    runId: string;
    fromState: RunStatus;
    toState: RunStatus;
    reason: string;
    at: string;
    finishedAt?: string;
  }): RunRecord {
    transaction(this.database, () => {
      const changed = this.database.prepare(`
        UPDATE runs
        SET status = ?, finished_at = COALESCE(?, finished_at)
        WHERE run_id = ? AND status = ?
      `).run(input.toState, input.finishedAt ?? null, input.runId, input.fromState).changes;
      if (changed !== 1) {
        throw new StateStoreError(
          "RUN_STATE_MISMATCH",
          `Run ${input.runId} is not in expected state ${input.fromState}`,
        );
      }
      this.database.prepare(`
        INSERT INTO run_transitions (run_id, seq, from_state, to_state, reason, at)
        SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?
        FROM run_transitions WHERE run_id = ?
      `).run(
        input.runId,
        input.fromState,
        input.toState,
        input.reason,
        input.at,
        input.runId,
      );
    });
    return this.find(input.runId)!;
  }
}

class SqliteAttemptRepository implements AttemptRepository {
  constructor(private readonly database: DatabaseSync) {}

  find(attemptId: string): AttemptRecord | undefined {
    const row = this.database.prepare("SELECT * FROM attempts WHERE attempt_id = ?")
      .get(attemptId) as unknown as AttemptRow | undefined;
    return row ? attemptRecord(row) : undefined;
  }

  list(runId: string): AttemptRecord[] {
    const rows = this.database.prepare(
      "SELECT * FROM attempts WHERE run_id = ? ORDER BY ordinal",
    ).all(runId) as unknown as AttemptRow[];
    return rows.map(attemptRecord);
  }

  transitions(attemptId: string): AttemptTransition[] {
    const rows = this.database.prepare(`
      SELECT attempt_id, seq, from_state, to_state, reason, at
      FROM transitions WHERE attempt_id = ? ORDER BY seq
    `).all(attemptId) as unknown as AttemptTransitionRow[];
    return rows.map((row) => ({
      attemptId: row.attempt_id,
      seq: row.seq,
      fromState: row.from_state,
      toState: row.to_state,
      reason: row.reason,
      at: row.at,
    }));
  }

  create(input: {
    attemptId: string;
    runId: string;
    ordinal: number;
    seed: number;
    createdAt: string;
  }): AttemptRecord {
    this.database.prepare(`
      INSERT INTO attempts (
        attempt_id, run_id, ordinal, seed, lifecycle_status, agent_outcome, created_at
      ) VALUES (?, ?, ?, ?, 'CREATED', 'not_started', ?)
    `).run(input.attemptId, input.runId, input.ordinal, input.seed, input.createdAt);
    return this.find(input.attemptId)!;
  }

  transition(input: {
    attemptId: string;
    fromState: AttemptLifecycleStatus;
    toState: AttemptLifecycleStatus;
    reason: string;
    at: string;
    terminal?: {
      executionClassification: ExecutionClassification;
      terminationCause: string | null;
      terminationPhase: TerminationPhase | null;
      failureCode: string | null;
      finishedAt: string;
    };
    producer?: CreateProducerRecordInput;
  }): AttemptRecord {
    if (input.producer && input.producer.attemptId !== input.attemptId) {
      throw new StateStoreError(
        "PRODUCER_ATTEMPT_MISMATCH",
        "Producer record must belong to the transitioned Attempt",
      );
    }

    transaction(this.database, () => {
      const changed = input.terminal
        ? this.database.prepare(`
            UPDATE attempts SET
              lifecycle_status = ?,
              termination_cause = ?,
              termination_phase = ?,
              execution_classification = ?,
              failure_code = ?,
              finished_at = ?
            WHERE attempt_id = ? AND lifecycle_status = ?
          `).run(
            input.toState,
            input.terminal.terminationCause,
            input.terminal.terminationPhase,
            input.terminal.executionClassification,
            input.terminal.failureCode,
            input.terminal.finishedAt,
            input.attemptId,
            input.fromState,
          ).changes
        : this.database.prepare(`
            UPDATE attempts SET lifecycle_status = ?
            WHERE attempt_id = ? AND lifecycle_status = ?
          `).run(input.toState, input.attemptId, input.fromState).changes;
      if (changed !== 1) {
        throw new StateStoreError(
          "ATTEMPT_STATE_MISMATCH",
          `Attempt ${input.attemptId} is not in expected state ${input.fromState}`,
        );
      }
      this.database.prepare(`
        INSERT INTO transitions (attempt_id, seq, from_state, to_state, reason, at)
        SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?
        FROM transitions WHERE attempt_id = ?
      `).run(
        input.attemptId,
        input.fromState,
        input.toState,
        input.reason,
        input.at,
        input.attemptId,
      );
      if (input.producer) insertProducer(this.database, input.producer);
    });
    return this.find(input.attemptId)!;
  }

  setAgentOutcome(
    attemptId: string,
    outcome: Exclude<AgentOutcome, "not_started">,
    producer?: CreateProducerRecordInput,
  ): AttemptRecord {
    if (producer && producer.attemptId !== attemptId) {
      throw new StateStoreError(
        "PRODUCER_ATTEMPT_MISMATCH",
        "Producer record must belong to the updated Attempt",
      );
    }

    transaction(this.database, () => {
      const changed = this.database.prepare(`
        UPDATE attempts SET agent_outcome = ?
        WHERE attempt_id = ? AND agent_outcome = 'not_started'
      `).run(outcome, attemptId).changes;
      if (changed !== 1) {
        throw new StateStoreError(
          "AGENT_OUTCOME_IMMUTABLE",
          `Attempt ${attemptId} Agent outcome is already finalized`,
        );
      }
      if (producer) insertProducer(this.database, producer);
    });
    return this.find(attemptId)!;
  }

  setAgentNetworkId(attemptId: string, agentNetworkId: string): AttemptRecord {
    const changed = this.database.prepare(`
      UPDATE attempts SET agent_network_id = ?
      WHERE attempt_id = ? AND agent_network_id IS NULL
    `).run(agentNetworkId, attemptId).changes;
    if (changed !== 1) throw new StateStoreError("AGENT_NETWORK_ID_IMMUTABLE", "Attempt network identity is already finalized");
    return this.find(attemptId)!;
  }

  setSubmissionSnapshotDigest(attemptId: string, submissionSnapshotDigest: string): AttemptRecord {
    const changed = this.database.prepare(`
      UPDATE attempts SET submission_snapshot_digest = ?
      WHERE attempt_id = ? AND submission_snapshot_digest IS NULL
    `).run(submissionSnapshotDigest, attemptId).changes;
    if (changed !== 1) throw new StateStoreError("SUBMISSION_SNAPSHOT_DIGEST_IMMUTABLE", "Submission snapshot digest is already finalized");
    return this.find(attemptId)!;
  }
}

class SqliteProducerRepository implements ProducerRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(input: CreateProducerRecordInput): ProducerRecord {
    insertProducer(this.database, input);
    return input;
  }

  forRun(runId: string): ProducerRecord[] {
    const rows = this.database.prepare(`
      SELECT producer_records.*
      FROM producer_records
      JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = ?
      ORDER BY attempts.ordinal, producer_records.rowid
    `).all(runId) as unknown as ProducerRow[];
    return rows.map(producerRecord);
  }
}

class SqliteAdapterFrameRepository implements AdapterFrameRepository {
  constructor(private readonly database: DatabaseSync) {}

  append(record: AdapterFrameRecord): AdapterFrameRecord {
    this.database.prepare(`
      INSERT INTO adapter_frames (
        attempt_id, direction, seq, type, frame_json, received_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.attemptId,
      record.direction,
      record.seq,
      record.type,
      record.frameJson,
      record.receivedAt,
    );
    return record;
  }

  forAttempt(attemptId: string): AdapterFrameRecord[] {
    const rows = this.database.prepare(`
      SELECT attempt_id, direction, seq, type, frame_json, received_at
      FROM adapter_frames WHERE attempt_id = ? ORDER BY direction, seq
    `).all(attemptId) as unknown as AdapterFrameRow[];
    return rows.map(adapterFrameRecord);
  }
}

class SqliteToolCallRepository implements ToolCallRepository {
  constructor(private readonly database: DatabaseSync) {}

  accept(record: {
    attemptId: string;
    seq: number;
    tool: string;
    argumentsJson: string;
    acceptedAt: string;
  }): ToolCallRecord {
    this.database.prepare(`
      INSERT INTO tool_calls (
        attempt_id, seq, tool, arguments_json, status, accepted_at
      ) VALUES (?, ?, ?, ?, 'accepted', ?)
    `).run(record.attemptId, record.seq, record.tool, record.argumentsJson, record.acceptedAt);
    return this.find(record.attemptId, record.seq)!;
  }

  complete(record: {
    attemptId: string;
    seq: number;
    outcomeCode: string;
    outputBytes: number;
    truncated: boolean;
    artifactRef: string | null;
    executedAt: string;
  }): ToolCallRecord {
    const changed = this.database.prepare(`
      UPDATE tool_calls SET
        status = 'completed', outcome_code = ?, output_bytes = ?,
        truncated = ?, artifact_ref = ?, executed_at = ?
      WHERE attempt_id = ? AND seq = ? AND status = 'accepted'
    `).run(
      record.outcomeCode,
      record.outputBytes,
      record.truncated ? 1 : 0,
      record.artifactRef,
      record.executedAt,
      record.attemptId,
      record.seq,
    ).changes;
    if (changed !== 1) {
      throw new StateStoreError(
        "TOOL_CALL_STATE_MISMATCH",
        `Tool call ${record.attemptId}:${record.seq} is not accepted`,
      );
    }
    return this.find(record.attemptId, record.seq)!;
  }

  forAttempt(attemptId: string): ToolCallRecord[] {
    return this.database.prepare(`
      SELECT * FROM tool_calls WHERE attempt_id = ? ORDER BY seq
    `).all(attemptId).map((row) => toolCallRecord(row as unknown as ToolCallRow));
  }

  private find(attemptId: string, seq: number): ToolCallRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM tool_calls WHERE attempt_id = ? AND seq = ?
    `).get(attemptId, seq) as unknown as ToolCallRow | undefined;
    return row ? toolCallRecord(row) : undefined;
  }
}

class SqliteLeaseRepository implements LeaseRepository {
  constructor(private readonly database: DatabaseSync) {}

  find(leaseName: string): ExecutionLeaseRecord | undefined {
    const row = this.database.prepare(
      "SELECT * FROM execution_leases WHERE lease_name = ?",
    ).get(leaseName) as unknown as LeaseRow | undefined;
    return row ? leaseRecord(row) : undefined;
  }

  acquire(leaseName: string, owner: LeaseOwner): ExecutionLeaseRecord {
    return transaction(this.database, () => {
      const existing = this.find(leaseName);
      const now = new Date().toISOString();
      if (!existing) {
        this.database.prepare(`
          INSERT INTO execution_leases (
            lease_name, owner_uuid, owner_pid, owner_pid_started_at, heartbeat_at, acquired_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          leaseName,
          owner.ownerUuid,
          owner.ownerPid,
          owner.ownerPidStartedAt,
          now,
          now,
        );
        return this.find(leaseName)!;
      }

      const sameOwner = existing.ownerUuid === owner.ownerUuid
        && existing.ownerPid === owner.ownerPid
        && existing.ownerPidStartedAt === owner.ownerPidStartedAt;
      if (!sameOwner) {
        const processState = inspectProcess(existing.ownerPid);
        const stale = !processState.alive
          || (processState.startedAt !== undefined
            && processState.startedAt !== existing.ownerPidStartedAt);
        if (!stale) {
          throw new StateStoreError(
            "EXECUTOR_LEASE_HELD",
            `Lease ${leaseName} is held by live owner ${existing.ownerUuid}`,
          );
        }
      }

      this.database.prepare(`
        UPDATE execution_leases SET
          owner_uuid = ?, owner_pid = ?, owner_pid_started_at = ?,
          heartbeat_at = ?, acquired_at = ?
        WHERE lease_name = ?
      `).run(
        owner.ownerUuid,
        owner.ownerPid,
        owner.ownerPidStartedAt,
        now,
        now,
        leaseName,
      );
      return this.find(leaseName)!;
    });
  }

  heartbeat(leaseName: string, owner: LeaseOwner): ExecutionLeaseRecord {
    const changed = this.database.prepare(`
      UPDATE execution_leases SET heartbeat_at = ?
      WHERE lease_name = ? AND owner_uuid = ? AND owner_pid = ? AND owner_pid_started_at = ?
    `).run(
      new Date().toISOString(),
      leaseName,
      owner.ownerUuid,
      owner.ownerPid,
      owner.ownerPidStartedAt,
    ).changes;
    if (changed !== 1) {
      throw new StateStoreError(
        "EXECUTOR_LEASE_LOST",
        `Lease ${leaseName} is no longer owned by ${owner.ownerUuid}`,
      );
    }
    return this.find(leaseName)!;
  }

  release(leaseName: string, owner: LeaseOwner): void {
    this.database.prepare(`
      DELETE FROM execution_leases
      WHERE lease_name = ? AND owner_uuid = ? AND owner_pid = ? AND owner_pid_started_at = ?
    `).run(
      leaseName,
      owner.ownerUuid,
      owner.ownerPid,
      owner.ownerPidStartedAt,
    );
  }
}

class SqliteArtifactRepository implements ArtifactRepository {
  constructor(private readonly database: DatabaseSync) {}

  finalizeAttempt(input: {
    attemptId: string;
    manifestChecksum: string;
    finalizedAt: string;
    artifacts: ArtifactRecord[];
  }): ManifestRecord {
    if (input.artifacts.some((artifact) => (
      artifact.attemptId !== input.attemptId || artifact.status !== "finalized"
    ))) {
      throw new StateStoreError(
        "ARTIFACT_ATTEMPT_MISMATCH",
        "Finalized Artifacts must belong to the finalized Attempt",
      );
    }

    transaction(this.database, () => {
      const attempt = this.database.prepare(
        "SELECT lifecycle_status FROM attempts WHERE attempt_id = ?",
      ).get(input.attemptId) as { lifecycle_status: AttemptLifecycleStatus } | undefined;
      if (attempt?.lifecycle_status !== "FINALIZING" && attempt?.lifecycle_status !== "FAILED") {
        throw new StateStoreError(
          "ARTIFACT_ATTEMPT_STATE_MISMATCH",
          `Attempt ${input.attemptId} is not finalizing or failed`,
        );
      }
      const insert = this.database.prepare(`
        INSERT INTO artifacts (
          attempt_id, logical_type, mime, relative_path, checksum,
          size, status, audience, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const artifact of input.artifacts) {
        insert.run(
          artifact.attemptId,
          artifact.logicalType,
          artifact.mime,
          artifact.relativePath,
          artifact.checksum,
          artifact.size,
          artifact.status,
          artifact.audience,
          artifact.createdAt,
        );
      }
      this.database.prepare(`
        INSERT INTO manifests (attempt_id, manifest_checksum, finalized_at)
        VALUES (?, ?, ?)
      `).run(input.attemptId, input.manifestChecksum, input.finalizedAt);
    });
    return {
      attemptId: input.attemptId,
      manifestChecksum: input.manifestChecksum,
      finalizedAt: input.finalizedAt,
    };
  }

  forRun(runId: string): ArtifactRecord[] {
    const rows = this.database.prepare(`
      SELECT artifacts.* FROM artifacts
      JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = ?
      ORDER BY attempts.ordinal, artifacts.relative_path
    `).all(runId) as unknown as ArtifactRow[];
    return rows.map(artifactRecord);
  }
}

class SqliteManifestRepository implements ManifestRepository {
  constructor(private readonly database: DatabaseSync) {}

  find(attemptId: string): ManifestRecord | undefined {
    const row = this.database.prepare(
      "SELECT * FROM manifests WHERE attempt_id = ?",
    ).get(attemptId) as unknown as ManifestRow | undefined;
    return row ? manifestRecord(row) : undefined;
  }

  forRun(runId: string): ManifestRecord[] {
    const rows = this.database.prepare(`
      SELECT manifests.* FROM manifests
      JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = ?
      ORDER BY attempts.ordinal
    `).all(runId) as unknown as ManifestRow[];
    return rows.map(manifestRecord);
  }
}

class SqliteResultRepository implements ResultRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(record: ResultRecord): ResultRecord {
    const changed = this.database.prepare(`
      INSERT INTO results (run_id, result_json, result_checksum, created_at)
      SELECT ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM runs WHERE run_id = ? AND status = 'AGGREGATING')
    `).run(
      record.runId,
      record.resultJson,
      record.resultChecksum,
      record.createdAt,
      record.runId,
    ).changes;
    if (changed !== 1) {
      throw new StateStoreError(
        "RESULT_RUN_STATE_MISMATCH",
        `Run ${record.runId} is not aggregating`,
      );
    }
    return record;
  }

  find(runId: string): ResultRecord | undefined {
    const row = this.database.prepare("SELECT * FROM results WHERE run_id = ?")
      .get(runId) as unknown as ResultRow | undefined;
    return row ? resultRecord(row) : undefined;
  }
}

class SqliteExportRepository implements ExportRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(record: ExportRecord): ExportRecord {
    this.database.prepare(`
      INSERT INTO exports (
        export_id, run_id, audience, public_result_checksum, manifest_hash,
        public_code_policy_version, policy_version, created_at, outcome, failure_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.exportId,
      record.runId,
      record.audience,
      record.publicResultChecksum,
      record.manifestHash,
      record.publicCodePolicyVersion,
      record.policyVersion,
      record.createdAt,
      record.outcome,
      record.failureCode,
    );
    return record;
  }

  find(exportId: string): ExportRecord | undefined {
    const row = this.database.prepare("SELECT * FROM exports WHERE export_id = ?")
      .get(exportId) as unknown as ExportRow | undefined;
    return row ? exportRecord(row) : undefined;
  }

  forRun(runId: string): ExportRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM exports WHERE run_id = ? ORDER BY created_at, export_id
    `).all(runId) as unknown as ExportRow[];
    return rows.map(exportRecord);
  }
}

export function openStateStore(databasePath: string): StateStore {
  const database = migrate(databasePath);
  return {
    databasePath,
    tasks: new SqliteTaskRepository(database),
    runs: new SqliteRunRepository(database),
    attempts: new SqliteAttemptRepository(database),
    producers: new SqliteProducerRepository(database),
    adapterFrames: new SqliteAdapterFrameRepository(database),
    toolCalls: new SqliteToolCallRepository(database),
    leases: new SqliteLeaseRepository(database),
    artifacts: new SqliteArtifactRepository(database),
    manifests: new SqliteManifestRepository(database),
    results: new SqliteResultRepository(database),
    exports: new SqliteExportRepository(database),
    close: () => database.close(),
  };
}

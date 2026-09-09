import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, win32 } from "node:path";

import {
  containsObviousCredential,
  type FrontendAgentArtifactManifest,
  validateContractDocument,
} from "@frontend-agent-benchmark/contracts";
import type {
  ArtifactAudience,
  ArtifactRecord,
  StateStore,
} from "@frontend-agent-benchmark/state-store-sqlite";

export type ArtifactCommitStep =
  | "beforeManifest"
  | "afterManifest"
  | "afterRenameBeforeRecord"
  | "afterRecord";

export class ArtifactStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ArtifactStoreError";
  }
}

export interface StageArtifactInput {
  runId: string;
  attemptId: string;
  ordinal: number;
  logicalType: string;
  mime: string;
  relativePath: string;
  audience: ArtifactAudience;
  content: string | Uint8Array;
  producerRef?: string;
}

interface StagedArtifact extends ArtifactRecord {
  runId: string;
  ordinal: number;
  producerRef: string;
}

export interface ReconciliationIssue {
  code: string;
  path?: string;
}

export interface ReconciliationReport {
  runId: string;
  status: string;
  healthy: boolean;
  repaired: { inputJson: boolean; resultJson: boolean };
  quarantined: string[];
  issues: ReconciliationIssue[];
  verified: { artifacts: number; manifests: number };
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeIdentifier(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("\\")
    && value !== "." && value !== "..";
}

function safeRelativePath(value: string): boolean {
  if (!value || isAbsolute(value) || win32.isAbsolute(value) || value.includes("\0")) return false;
  const segments = value.split(/[\\/]/);
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
  const metadata = lstatSync(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new ArtifactStoreError("UNSAFE_ARTIFACT_PATH", `Unsafe directory ${path}`);
  }
}

function atomicWrite(path: string, value: string): void {
  const directory = dirname(path);
  ensureDirectory(directory);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(descriptor, value);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, path);
    fsyncDirectory(directory);
  } catch (error) {
    try { unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

function matchesChecksum(path: string, checksum: string, size?: number): boolean {
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return false;
    const bytes = readFileSync(path);
    return (size === undefined || size === bytes.length) && sha256(bytes) === checksum;
  } catch {
    return false;
  }
}

export class ArtifactStoreFs {
  private readonly staged = new Map<string, StagedArtifact[]>();
  private readonly runsRoot: string;
  private readonly store: StateStore;
  private readonly onCommitStep?: (step: ArtifactCommitStep) => void;

  constructor(options: {
    runsRoot: string;
    store: StateStore;
    onCommitStep?: (step: ArtifactCommitStep) => void;
  }) {
    this.runsRoot = options.runsRoot;
    this.store = options.store;
    this.onCommitStep = options.onCommitStep;
  }

  stage(input: StageArtifactInput): ArtifactRecord {
    if (!safeIdentifier(input.runId) || !safeIdentifier(input.attemptId)
      || !safeRelativePath(input.relativePath)) {
      throw new ArtifactStoreError(
        "UNSAFE_ARTIFACT_PATH",
        `Unsafe Artifact entry ${input.relativePath}`,
      );
    }

    const stagingDirectory = this.stagingDirectory(input.runId, input.attemptId);
    ensureDirectory(stagingDirectory);
    let parent = stagingDirectory;
    const segments = input.relativePath.split(/[\\/]/);
    for (const segment of segments.slice(0, -1)) {
      parent = join(parent, segment);
      ensureDirectory(parent);
    }

    const path = join(stagingDirectory, ...segments);
    const bytes = typeof input.content === "string"
      ? Buffer.from(input.content)
      : Buffer.from(input.content);
    try {
      const descriptor = openSync(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeFileSync(descriptor, bytes);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      fsyncDirectory(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw new ArtifactStoreError("UNSAFE_ARTIFACT_PATH", `Symlink entry ${input.relativePath}`);
      }
      throw error;
    }

    const artifact: StagedArtifact = {
      runId: input.runId,
      attemptId: input.attemptId,
      ordinal: input.ordinal,
      logicalType: input.logicalType,
      mime: input.mime,
      relativePath: segments.join("/"),
      checksum: sha256(bytes),
      size: bytes.length,
      status: "staged",
      audience: input.audience,
      createdAt: new Date().toISOString(),
      producerRef: input.producerRef ?? `attempt:${input.attemptId}:artifact`,
    };
    const key = this.key(input.runId, input.attemptId);
    const entries = this.staged.get(key) ?? [];
    entries.push(artifact);
    this.staged.set(key, entries);
    return artifact;
  }

  finalize(runId: string, attemptId: string, ordinal: number): {
    manifestChecksum: string;
    artifacts: ArtifactRecord[];
  } {
    const key = this.key(runId, attemptId);
    const staged = [...(this.staged.get(key) ?? [])]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    if (staged.length === 0) {
      throw new ArtifactStoreError("ARTIFACT_STAGING_EMPTY", `Attempt ${attemptId} has no Artifacts`);
    }

    const stagingDirectory = this.stagingDirectory(runId, attemptId);
    for (const artifact of staged) {
      const path = join(stagingDirectory, artifact.relativePath);
      if (!matchesChecksum(path, artifact.checksum, artifact.size)) {
        throw new ArtifactStoreError(
          "ARTIFACT_CHECKSUM_MISMATCH",
          `Staged Artifact ${artifact.relativePath} changed before finalization`,
        );
      }
      if (!artifact.mime.startsWith("text/")
        && artifact.mime !== "application/json"
        && artifact.mime !== "application/x-ndjson") {
        throw new ArtifactStoreError(
          "ARTIFACT_SCAN_UNSUPPORTED",
          `V1.3 cannot fully scan Artifact MIME ${artifact.mime}`,
        );
      }
      const text = readFileSync(path, "utf8");
      if (containsObviousCredential(text)) {
        throw new ArtifactStoreError(
          "ARTIFACT_DATA_SCAN_FAILED",
          `Artifact ${artifact.relativePath} contains a credential pattern`,
        );
      }
    }

    const finalized = staged.map<ArtifactRecord>((artifact) => ({
      attemptId: artifact.attemptId,
      logicalType: artifact.logicalType,
      mime: artifact.mime,
      relativePath: artifact.relativePath,
      checksum: artifact.checksum,
      size: artifact.size,
      status: "finalized",
      audience: artifact.audience,
      createdAt: artifact.createdAt,
    }));
    const manifest: FrontendAgentArtifactManifest = {
      schemaVersion: 1,
      artifactManifestId: `${attemptId}:manifest`,
      attemptId,
      status: "finalized",
      entries: staged.map((artifact) => ({
        artifactId: `${attemptId}:${artifact.relativePath}`,
        logicalType: artifact.logicalType,
        producerRef: artifact.producerRef,
        mimeType: artifact.mime,
        sizeBytes: artifact.size,
        sha256: artifact.checksum,
        path: artifact.relativePath,
        status: "finalized",
        audience: artifact.audience,
        redactionStatus: "not_required",
        dataScanStatus: "passed",
        scanMetadata: {
          scannedChecksum: artifact.checksum,
          scannerVersion: "deterministic-text-pattern-v1",
          scannerWorkerDigest: "in-process-v1.3",
          coveragePolicyVersion: 1,
          coverageOutcome: "complete",
        },
      })),
    };
    const validation = validateContractDocument(manifest, "artifact-manifest");
    if (!validation.valid) {
      throw new ArtifactStoreError("ARTIFACT_MANIFEST_INVALID", "Generated manifest is invalid");
    }
    const manifestJson = JSON.stringify(manifest);
    const manifestChecksum = sha256(manifestJson);

    this.onCommitStep?.("beforeManifest");
    const manifestPath = join(stagingDirectory, "manifest.json");
    const descriptor = openSync(
      manifestPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(descriptor, manifestJson);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    fsyncDirectory(stagingDirectory);
    this.onCommitStep?.("afterManifest");

    const attemptsDirectory = join(this.runDirectory(runId), "attempts");
    ensureDirectory(attemptsDirectory);
    const finalDirectory = join(attemptsDirectory, String(ordinal));
    if (existsSync(finalDirectory)) {
      throw new ArtifactStoreError(
        "ARTIFACT_FINAL_PATH_EXISTS",
        `Attempt directory ${ordinal} already exists`,
      );
    }
    renameSync(stagingDirectory, finalDirectory);
    fsyncDirectory(attemptsDirectory);
    this.onCommitStep?.("afterRenameBeforeRecord");

    if (!matchesChecksum(join(finalDirectory, "manifest.json"), manifestChecksum)
      || finalized.some((artifact) => !matchesChecksum(
        join(finalDirectory, artifact.relativePath), artifact.checksum, artifact.size,
      ))) {
      throw new ArtifactStoreError(
        "ARTIFACT_FINAL_VERIFICATION_FAILED",
        `Attempt ${attemptId} failed final checksum verification`,
      );
    }

    this.store.artifacts.finalizeAttempt({
      attemptId,
      manifestChecksum,
      finalizedAt: new Date().toISOString(),
      artifacts: finalized,
    });
    this.onCommitStep?.("afterRecord");
    this.staged.delete(key);
    try { rmdirSync(join(this.runDirectory(runId), ".tmp")); } catch {}
    return { manifestChecksum, artifacts: finalized };
  }

  writeDerivedResult(runId: string, resultJson: string, resultChecksum: string): void {
    if (sha256(resultJson) !== resultChecksum) {
      throw new ArtifactStoreError("RESULT_CHECKSUM_MISMATCH", "Canonical Result checksum is invalid");
    }
    const path = join(this.runDirectory(runId), "result.json");
    atomicWrite(path, resultJson);
    if (!matchesChecksum(path, resultChecksum)) {
      throw new ArtifactStoreError("RESULT_WRITE_VERIFICATION_FAILED", "Derived Result verification failed");
    }
  }

  reconcile(runId: string): ReconciliationReport {
    if (!safeIdentifier(runId)) {
      throw new ArtifactStoreError("UNSAFE_ARTIFACT_PATH", `Unsafe Run ID ${runId}`);
    }
    const run = this.store.runs.find(runId);
    if (!run) throw new ArtifactStoreError("RUN_NOT_FOUND", `Run ${runId} was not found`);
    const runDirectory = this.runDirectory(runId);
    ensureDirectory(runDirectory);
    const issues: ReconciliationIssue[] = [];
    const quarantined = this.quarantineStaging(runId);
    for (const path of quarantined) issues.push({ code: "PARTIAL_STAGING_QUARANTINED", path });

    const repaired = { inputJson: false, resultJson: false };
    const inputPath = join(runDirectory, "input.json");
    if (!matchesChecksum(inputPath, run.inputJsonChecksum)) {
      atomicWrite(inputPath, run.resolvedInputJson);
      repaired.inputJson = true;
    }

    const canonicalResult = this.store.results.find(runId);
    if (canonicalResult) {
      const resultPath = join(runDirectory, "result.json");
      if (!matchesChecksum(resultPath, canonicalResult.resultChecksum)) {
        atomicWrite(resultPath, canonicalResult.resultJson);
        repaired.resultJson = true;
      }
      if (!matchesChecksum(resultPath, canonicalResult.resultChecksum)) {
        issues.push({ code: "RESULT_VERIFICATION_FAILED", path: "result.json" });
      }
    } else if (run.status === "COMPLETED") {
      issues.push({ code: "RESULT_RECORD_MISSING" });
    }

    const attempts = this.store.attempts.list(runId);
    const attemptById = new Map(attempts.map((attempt) => [attempt.attemptId, attempt]));
    const attemptByOrdinal = new Map(attempts.map((attempt) => [attempt.ordinal, attempt]));
    const artifacts = this.store.artifacts.forRun(runId);
    const manifests = this.store.manifests.forRun(runId);
    const manifestByAttempt = new Map(manifests.map((manifest) => [manifest.attemptId, manifest]));
    let verifiedArtifacts = 0;
    let verifiedManifests = 0;

    for (const artifact of artifacts) {
      const attempt = attemptById.get(artifact.attemptId);
      if (!attempt || !safeRelativePath(artifact.relativePath)) {
        issues.push({ code: "UNSAFE_ARTIFACT_RECORD", path: artifact.relativePath });
        continue;
      }
      if (artifact.status !== "finalized") {
        issues.push({ code: "ARTIFACT_NOT_FINALIZED", path: artifact.relativePath });
        continue;
      }
      const relativePath = `attempts/${attempt.ordinal}/${artifact.relativePath}`;
      if (!matchesChecksum(join(runDirectory, relativePath), artifact.checksum, artifact.size)) {
        issues.push({ code: "ARTIFACT_VERIFICATION_FAILED", path: relativePath });
      } else {
        verifiedArtifacts += 1;
      }
      if (!manifestByAttempt.has(artifact.attemptId)) {
        issues.push({ code: "MANIFEST_RECORD_MISSING", path: relativePath });
      }
    }

    for (const manifestRecord of manifests) {
      const attempt = attemptById.get(manifestRecord.attemptId);
      if (!attempt) {
        issues.push({ code: "MANIFEST_ATTEMPT_MISSING" });
        continue;
      }
      const relativePath = `attempts/${attempt.ordinal}/manifest.json`;
      const path = join(runDirectory, relativePath);
      if (!matchesChecksum(path, manifestRecord.manifestChecksum)) {
        issues.push({ code: "MANIFEST_VERIFICATION_FAILED", path: relativePath });
        continue;
      }
      try {
        const manifest = JSON.parse(readFileSync(path, "utf8")) as FrontendAgentArtifactManifest;
        if (!validateContractDocument(manifest, "artifact-manifest").valid) {
          issues.push({ code: "MANIFEST_INVALID", path: relativePath });
          continue;
        }
        const expected = artifacts.filter(({ attemptId }) => attemptId === manifestRecord.attemptId);
        const entries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
        if (manifest.attemptId !== manifestRecord.attemptId || expected.some((artifact) => {
          const entry = entries.get(artifact.relativePath);
          return !entry
            || entry.sha256 !== artifact.checksum
            || entry.sizeBytes !== artifact.size
            || entry.logicalType !== artifact.logicalType
            || entry.mimeType !== artifact.mime
            || entry.audience !== artifact.audience
            || entry.status !== artifact.status;
        })) {
          issues.push({ code: "MANIFEST_ARTIFACT_MISMATCH", path: relativePath });
          continue;
        }
        verifiedManifests += 1;
      } catch {
        issues.push({ code: "MANIFEST_INVALID", path: relativePath });
      }
    }

    const attemptsDirectory = join(runDirectory, "attempts");
    if (existsSync(attemptsDirectory)) {
      for (const entry of readdirSync(attemptsDirectory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const ordinal = Number(entry.name);
        const attempt = attemptByOrdinal.get(ordinal);
        const manifestPath = join(attemptsDirectory, entry.name, "manifest.json");
        if (existsSync(manifestPath) && (!attempt || !manifestByAttempt.has(attempt.attemptId))) {
          issues.push({ code: "UNRECORDED_MANIFEST", path: `attempts/${entry.name}/manifest.json` });
        }
      }
    }

    return {
      runId,
      status: run.status,
      healthy: run.status === "COMPLETED" && issues.length === 0,
      repaired,
      quarantined,
      issues,
      verified: { artifacts: verifiedArtifacts, manifests: verifiedManifests },
    };
  }

  private quarantineStaging(runId: string): string[] {
    const runDirectory = this.runDirectory(runId);
    const staging = join(runDirectory, ".tmp");
    if (!existsSync(staging)) return [];
    const quarantine = join(runDirectory, ".quarantine");
    ensureDirectory(quarantine);
    const moved: string[] = [];
    const metadata = lstatSync(staging);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      const target = join(quarantine, `unsafe-staging-${randomUUID()}`);
      renameSync(staging, target);
      moved.push(target);
    } else {
      for (const entry of readdirSync(staging)) {
        const target = join(quarantine, `${entry}-${randomUUID()}`);
        renameSync(join(staging, entry), target);
        moved.push(target);
      }
      rmdirSync(staging);
    }
    fsyncDirectory(quarantine);
    fsyncDirectory(runDirectory);
    return moved;
  }

  private runDirectory(runId: string): string {
    return join(this.runsRoot, runId);
  }

  private stagingDirectory(runId: string, attemptId: string): string {
    return join(this.runDirectory(runId), ".tmp", attemptId);
  }

  private key(runId: string, attemptId: string): string {
    return `${runId}\0${attemptId}`;
  }
}

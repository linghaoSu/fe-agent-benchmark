import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, win32 } from "node:path";

import {
  containsObviousCredential,
  type FrontendAgentEvaluationResult,
  type FrontendAgentExportManifest,
  type FrontendAgentRequesterExportResult,
  validateContractDocument,
} from "@frontend-agent-benchmark/contracts";
import type {
  ArtifactRecord,
  AttemptRecord,
  ExportRecord,
  StateStore,
} from "@frontend-agent-benchmark/state-store-sqlite";

export const PUBLIC_CODE_POLICY_VERSION = 1;
export const EXPORT_POLICY_VERSION = 1;

type PublicOutcomeCode = FrontendAgentRequesterExportResult["publicOutcomeCode"];
type PrivateOutcome =
  | "completed_solved"
  | "completed_unsolved"
  | "agent_failure"
  | "budget_exhausted"
  | "invalid"
  | "infrastructure_error"
  | "evaluator_error";

export const PUBLIC_OUTCOME_TAXONOMY_V1: Readonly<Record<PrivateOutcome, PublicOutcomeCode>> = {
  completed_solved: "SOLVED",
  completed_unsolved: "UNSOLVED",
  agent_failure: "NOT_EVALUATED",
  budget_exhausted: "NOT_EVALUATED",
  invalid: "INVALID",
  infrastructure_error: "NOT_EVALUATED",
  evaluator_error: "NOT_EVALUATED",
};

export type RunExportResult =
  | {
      exportId: string;
      outcome: "passed";
      publicResultChecksum: string;
    }
  | {
      exportId: string;
      outcome: "EXPORT_POLICY_DENIED";
      code: string;
    };

export class ExportPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExportPolicyError";
  }
}

interface ExportFile {
  path: string;
  content: Buffer;
}

interface ExportCandidate {
  publicResultChecksum: string;
  manifestJson: string;
  manifestHash: string;
  files: ExportFile[];
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeIdentifier(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".."
    && !value.includes("/") && !value.includes("\\");
}

function safeRelativePath(value: string): boolean {
  if (!value || isAbsolute(value) || win32.isAbsolute(value) || value.includes("\0")) return false;
  return value.split(/[\\/]/).every((part) => part !== "" && part !== "." && part !== "..");
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
  const metadata = lstatSync(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new ExportPolicyError("EXPORT_PATH_UNSAFE", `Unsafe export directory ${path}`);
  }
}

function fsyncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusive(path: string, content: Buffer): void {
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function absoluteHostPath(value: string): boolean {
  return /(?:^|[\s"'=])(?:file:\/\/)?\/(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/m.test(value)
    || /(?:^|[\s"'=])[A-Za-z]:\\[^\s"']+/m.test(value);
}

function assertReferenceClosure(values: string[], privatePaths: string[]): void {
  for (const value of values) {
    if (/maintainer_only/i.test(value)
      || /\b(?:private(?:_|-)?code|producer(?:_|-)?refs?|evidence(?:_|-)?refs?)\b/i.test(value)
      || absoluteHostPath(value)
      || privatePaths.some((path) => value.includes(path))) {
      throw new ExportPolicyError(
        "EXPORT_REFERENCE_CLOSURE_FAILED",
        "Requester export contains a private reference or host path",
      );
    }
  }
}

function assertCredentialFree(values: string[]): void {
  if (values.some(containsObviousCredential)) {
    throw new ExportPolicyError(
      "DATA_SCAN_CREDENTIAL_DETECTED",
      "Requester export contains a credential pattern",
    );
  }
}

function privateOutcome(result: FrontendAgentEvaluationResult, attempt: AttemptRecord): PrivateOutcome {
  if (!result.valid || attempt.executionClassification === "invalid") return "invalid";
  if (attempt.executionClassification === "completed") {
    return result.solved ? "completed_solved" : "completed_unsolved";
  }
  return attempt.executionClassification ?? "evaluator_error";
}

export class RunExporter {
  constructor(private readonly options: { runsRoot: string; store: StateStore }) {}

  export(runId: string): RunExportResult {
    const exportId = randomUUID();
    const createdAt = new Date().toISOString();
    if (!this.options.store.runs.find(runId)) {
      return { exportId, outcome: "EXPORT_POLICY_DENIED", code: "RUN_NOT_FOUND" };
    }

    try {
      const candidate = this.buildCandidate(runId, exportId, createdAt);
      const record: ExportRecord = {
        exportId,
        runId,
        audience: "requester",
        publicResultChecksum: candidate.publicResultChecksum,
        manifestHash: candidate.manifestHash,
        publicCodePolicyVersion: PUBLIC_CODE_POLICY_VERSION,
        policyVersion: EXPORT_POLICY_VERSION,
        createdAt,
        outcome: "passed",
        failureCode: null,
      };
      this.publish(runId, exportId, candidate, record);
      return {
        exportId,
        outcome: "passed",
        publicResultChecksum: candidate.publicResultChecksum,
      };
    } catch (error) {
      const code = error instanceof ExportPolicyError ? error.code : "EXPORT_WRITE_FAILED";
      this.options.store.exports.create({
        exportId,
        runId,
        audience: "requester",
        publicResultChecksum: null,
        manifestHash: null,
        publicCodePolicyVersion: PUBLIC_CODE_POLICY_VERSION,
        policyVersion: EXPORT_POLICY_VERSION,
        createdAt,
        outcome: "EXPORT_POLICY_DENIED",
        failureCode: code,
      });
      return { exportId, outcome: "EXPORT_POLICY_DENIED", code };
    }
  }

  private buildCandidate(runId: string, exportId: string, createdAt: string): ExportCandidate {
    if (!safeIdentifier(runId)) {
      throw new ExportPolicyError("EXPORT_PATH_UNSAFE", "Run ID is unsafe");
    }
    const run = this.options.store.runs.find(runId);
    if (!run || run.status !== "COMPLETED") {
      throw new ExportPolicyError(
        "EXPORT_RUN_NOT_COMPLETED",
        `Run ${runId} is not completed`,
      );
    }

    const canonical = this.options.store.results.find(runId);
    if (!canonical) {
      throw new ExportPolicyError("EXPORT_RESULT_MISSING", "Canonical Result is missing");
    }
    let result: FrontendAgentEvaluationResult;
    try {
      result = JSON.parse(canonical.resultJson) as FrontendAgentEvaluationResult;
    } catch {
      throw new ExportPolicyError("EXPORT_RESULT_INVALID", "Canonical Result is invalid JSON");
    }
    if (!validateContractDocument(result, "result").valid
      || result.runId !== runId
      || result.task.id !== run.taskId
      || result.task.version !== run.taskVersion
      || sha256(canonical.resultJson) !== canonical.resultChecksum) {
      throw new ExportPolicyError("EXPORT_RESULT_INVALID", "Canonical Result failed validation");
    }

    const attempts = this.options.store.attempts.list(runId);
    const attempt = attempts.find(({ attemptId }) => attemptId === result.attemptId);
    if (!attempt || attempt.lifecycleStatus !== "SUCCEEDED") {
      throw new ExportPolicyError("EXPORT_RESULT_INVALID", "Canonical Result Attempt is not finalized");
    }

    const publicResult: FrontendAgentRequesterExportResult = {
      schemaVersion: 1,
      requesterExportResultId: `${exportId}:result`,
      exportId,
      runId,
      task: { id: result.task.id, version: result.task.version },
      valid: result.valid,
      solved: result.solved,
      publicOutcomeCode: PUBLIC_OUTCOME_TAXONOMY_V1[privateOutcome(result, attempt)],
      scores: {
        build: result.scores.build.value,
        functional: result.scores.functional.value,
        visual: result.scores.visual.value,
        responsive: result.scores.responsive.value,
        accessibility: result.scores.accessibility.value,
        engineering: result.scores.engineering.value,
      },
      efficiency: { ...result.efficiency },
    };
    if (!validateContractDocument(publicResult, "requester-export-result").valid) {
      throw new ExportPolicyError("EXPORT_RESULT_SCHEMA_INVALID", "Public Result is invalid");
    }
    const resultJson = JSON.stringify(publicResult);
    const publicResultChecksum = sha256(resultJson);

    const attemptById = new Map(attempts.map((value) => [value.attemptId, value]));
    const artifacts = this.options.store.artifacts.forRun(runId);
    const privatePaths = artifacts
      .filter(({ audience }) => audience === "maintainer_only")
      .map(({ relativePath }) => relativePath);
    const files: ExportFile[] = [{ path: "result.json", content: Buffer.from(resultJson) }];
    const artifactEntries: FrontendAgentExportManifest["entries"] = [];
    const paths = new Set(["result.json", "manifest.json"]);

    for (const [index, artifact] of artifacts
      .filter(({ audience }) => audience === "requester_safe")
      .entries()) {
      const source = this.readArtifact(runId, artifact, attemptById);
      const path = `artifacts/${artifact.relativePath}`;
      if (!safeRelativePath(path) || paths.has(path)) {
        throw new ExportPolicyError("EXPORT_PATH_COLLISION", `Unsafe export path ${path}`);
      }
      paths.add(path);
      files.push({ path, content: source });
      artifactEntries.push({
        artifactId: `${exportId}:artifact:${index + 1}`,
        path,
        sha256: artifact.checksum,
        mimeType: artifact.mime,
        sizeBytes: artifact.size,
        audience: "requester_safe",
        redactionStatus: "passed",
        dataScanStatus: "passed",
      });
    }

    const manifest: FrontendAgentExportManifest = {
      schemaVersion: 1,
      exportManifestId: `${exportId}:manifest`,
      exportId,
      runId,
      audience: "requester",
      createdAt,
      entries: [{
        artifactId: `${exportId}:result`,
        path: "result.json",
        sha256: publicResultChecksum,
        mimeType: "application/json",
        sizeBytes: Buffer.byteLength(resultJson),
        audience: "requester_safe",
        redactionStatus: "passed",
        dataScanStatus: "passed",
      }, ...artifactEntries],
    };
    if (!validateContractDocument(manifest, "export-manifest").valid) {
      throw new ExportPolicyError("EXPORT_MANIFEST_SCHEMA_INVALID", "Export manifest is invalid");
    }
    const manifestJson = JSON.stringify(manifest);
    const serialized = [...files.map(({ content }) => content.toString("utf8")), manifestJson];
    assertReferenceClosure(serialized, privatePaths);
    assertCredentialFree(serialized);

    return {
      publicResultChecksum,
      manifestJson,
      manifestHash: sha256(manifestJson),
      files,
    };
  }

  private readArtifact(
    runId: string,
    artifact: ArtifactRecord,
    attemptById: Map<string, AttemptRecord>,
  ): Buffer {
    if (artifact.status !== "finalized" || !safeRelativePath(artifact.relativePath)) {
      throw new ExportPolicyError("EXPORT_ARTIFACT_INVALID", "Artifact record is not exportable");
    }
    if (!artifact.mime.startsWith("text/")
      && artifact.mime !== "application/json"
      && artifact.mime !== "application/x-ndjson") {
      throw new ExportPolicyError(
        "EXPORT_ARTIFACT_SCAN_UNSUPPORTED",
        `Artifact MIME ${artifact.mime} is unsupported by the deterministic scan`,
      );
    }
    const attempt = attemptById.get(artifact.attemptId);
    if (!attempt) {
      throw new ExportPolicyError("EXPORT_ARTIFACT_INVALID", "Artifact Attempt is missing");
    }
    const attemptDirectory = join(
      this.options.runsRoot,
      runId,
      "attempts",
      String(attempt.ordinal),
    );
    const parts = artifact.relativePath.split(/[\\/]/);
    const sourcePath = join(attemptDirectory, ...parts);
    let content: Buffer;
    try {
      let parent = attemptDirectory;
      const attemptMetadata = lstatSync(parent);
      if (!attemptMetadata.isDirectory() || attemptMetadata.isSymbolicLink()) {
        throw new Error("unsafe Attempt directory");
      }
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        const parentMetadata = lstatSync(parent);
        if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
          throw new Error("unsafe Artifact parent");
        }
      }
      const metadata = lstatSync(sourcePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("not a regular file");
      const descriptor = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        content = readFileSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    } catch {
      throw new ExportPolicyError("EXPORT_ARTIFACT_INVALID", "Artifact file is missing or unsafe");
    }
    const text = content.toString("utf8");
    assertReferenceClosure([text], []);
    assertCredentialFree([text]);
    if (content.length !== artifact.size || sha256(content) !== artifact.checksum) {
      throw new ExportPolicyError(
        "EXPORT_ARTIFACT_CHECKSUM_MISMATCH",
        "Artifact bytes do not match the finalized record",
      );
    }
    return content;
  }

  private publish(
    runId: string,
    exportId: string,
    candidate: ExportCandidate,
    record: ExportRecord,
  ): void {
    const runDirectory = join(this.options.runsRoot, runId);
    ensureDirectory(runDirectory);
    const exportsDirectory = join(runDirectory, "exports");
    ensureDirectory(exportsDirectory);
    const staging = join(exportsDirectory, `.requester-${exportId}.tmp`);
    const destination = join(exportsDirectory, "requester");
    const previous = join(exportsDirectory, `.requester-${exportId}.previous`);
    let movedPrevious = false;
    let published = false;

    try {
      ensureDirectory(staging);
      for (const file of candidate.files) {
        const parts = file.path.split("/");
        let parent = staging;
        for (const part of parts.slice(0, -1)) {
          parent = join(parent, part);
          ensureDirectory(parent);
        }
        writeExclusive(join(staging, ...parts), file.content);
        fsyncDirectory(parent);
      }
      writeExclusive(join(staging, "manifest.json"), Buffer.from(candidate.manifestJson));
      fsyncDirectory(staging);

      if (existsSync(destination)) {
        const metadata = lstatSync(destination);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          throw new ExportPolicyError("EXPORT_PATH_UNSAFE", "Requester export path is unsafe");
        }
        renameSync(destination, previous);
        movedPrevious = true;
        fsyncDirectory(exportsDirectory);
      }
      renameSync(staging, destination);
      published = true;
      fsyncDirectory(exportsDirectory);
      this.options.store.exports.create(record);
      if (movedPrevious) {
        try { rmSync(previous, { recursive: true }); } catch {}
      }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      if (published) rmSync(destination, { recursive: true, force: true });
      if (movedPrevious && existsSync(previous)) renameSync(previous, destination);
      fsyncDirectory(exportsDirectory);
      throw error;
    }
  }
}

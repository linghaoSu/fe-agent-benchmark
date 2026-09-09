import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";

export * from "./schemas.generated.js";

const SUPPORTED_SCHEMA_MAJOR = 1;
const SCHEMA_KINDS = [
  "task",
  "suite",
  "run",
  "attempt",
  "adapter-protocol",
  "tool-call",
  "evaluator-result",
  "artifact-manifest",
  "result",
  "comparison-report",
  "dependency-cache-snapshot",
  "network-policy",
  "producer-record",
  "export-manifest",
  "requester-export-result",
  "data-scan-result",
  "data-scan-coverage-policy",
  "proxy-diagnostic-record",
] as const;

export type DocumentKind = typeof SCHEMA_KINDS[number];

interface ContractSchema {
  $id: string;
  $schema: string;
}

const schemas = Object.fromEntries(SCHEMA_KINDS.map((kind) => [
  kind,
  JSON.parse(
    readFileSync(new URL(`../../../schemas/${kind}.schema.json`, import.meta.url), "utf8"),
  ) as ContractSchema,
])) as Record<DocumentKind, ContractSchema>;
const ajv = new Ajv2020({ allErrors: true });
const validators = Object.fromEntries(SCHEMA_KINDS.map((kind) => [
  kind,
  ajv.compile(schemas[kind]),
])) as Record<DocumentKind, ValidateFunction>;

export interface ContractError {
  code: string;
  location: string;
  message: string;
}

interface ValidationFailure {
  valid: false;
  kind?: DocumentKind;
  errors: ContractError[];
}

export type TaskValidationResult =
  | {
      valid: true;
      kind: "task";
      taskId: string;
      version: number;
      schema: {
        id: string;
        draft: string;
        version: number;
      };
    }
  | ValidationFailure;

export type ResultValidationResult =
  | {
      valid: true;
      kind: "result";
      runId: string;
      taskId: string;
      version: number;
      schema: {
        id: string;
        draft: string;
        version: number;
      };
    }
  | ValidationFailure;

type GenericDocumentKind = Exclude<DocumentKind, "task" | "result">;

interface GenericValidationSuccess {
  valid: true;
  kind: GenericDocumentKind;
  version: number;
  schema: {
    id: string;
    draft: string;
    version: number;
  };
}

export type ContractValidationResult =
  | TaskValidationResult
  | ResultValidationResult
  | GenericValidationSuccess;

export interface BundleChecksumFile {
  path: string;
  sha256: string;
}

export type BundleChecksumResult =
  | {
      bundleChecksum: string;
      files: BundleChecksumFile[];
    }
  | {
      errors: ContractError[];
    };

export interface PreflightCode extends ContractError {
  file: string;
  missingPackages?: string[];
}

export type PreflightResult =
  | { preflight: "passed" }
  | { preflight: "rejected"; codes: PreflightCode[] };

export interface PreflightedTaskBundle {
  taskId: string;
  version: number;
  schemaVersion: number;
  environmentImage: string;
  imageDigest: string;
  budgets: {
    maxWallTimeSeconds: number;
    maxAgentSteps: number;
    maxCostUsd: number;
  };
  permissions: {
    writablePaths: string[];
    forbiddenPaths: string[];
  };
  dependencyLockHash: string;
  dependencyCacheSnapshotId: string;
}

export function writablePathPrefixes(patterns: string[]): string[] | undefined {
  const prefixes: string[] = [];
  for (const pattern of patterns) {
    const match = /^([a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*)\/\*\*$/.exec(pattern);
    if (!match || match[1]!.split("/").some((part) => part === "." || part === "..")) return undefined;
    prefixes.push(match[1]!);
  }
  return [...new Set(prefixes)].sort();
}

function pointer(location: string, property: string): string {
  const escapedProperty = property.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${location}/${escapedProperty}`;
}

function structuralError(error: ErrorObject): ContractError {
  if (error.keyword === "required") {
    const missingProperty = (error.params as { missingProperty: string }).missingProperty;
    return {
      code: "schema.required",
      location: pointer(error.instancePath, missingProperty),
      message: `Required property ${missingProperty} is missing`,
    };
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = (error.params as { additionalProperty: string }).additionalProperty;
    return {
      code: "schema.additional_property",
      location: pointer(error.instancePath, additionalProperty),
      message: `Unknown property ${additionalProperty}`,
    };
  }

  const codes: Record<string, string> = {
    enum: "schema.enum",
    maximum: "schema.range",
    minimum: "schema.range",
    minLength: "schema.min_length",
    pattern: "schema.pattern",
    type: "schema.type",
    uniqueItems: "schema.unique_items",
  };

  return {
    code: codes[error.keyword] ?? "schema.invalid",
    location: error.instancePath,
    message: error.message ?? "Value does not match the document schema",
  };
}

function loadDocument(path: string): { document: unknown } | { error: ContractError } {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    return {
      error: {
        code: "input.read_error",
        location: "",
        message: error instanceof Error ? error.message : "Unable to read document",
      },
    };
  }

  try {
    return { document: parse(source) };
  } catch (error) {
    return {
      error: {
        code: "document.parse_error",
        location: "",
        message: error instanceof Error ? error.message : "Unable to parse document",
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const KIND_MARKERS: ReadonlyArray<readonly [GenericDocumentKind, string]> = [
  ["adapter-protocol", "protocolVersion"],
  ["tool-call", "toolCallId"],
  ["evaluator-result", "evaluatorResultId"],
  ["artifact-manifest", "artifactManifestId"],
  ["comparison-report", "comparisonReportId"],
  ["network-policy", "networkPolicyId"],
  ["producer-record", "producerId"],
  ["export-manifest", "exportManifestId"],
  ["requester-export-result", "requesterExportResultId"],
  ["data-scan-result", "dataScanResultId"],
  ["data-scan-coverage-policy", "dataScanCoveragePolicyId"],
  ["proxy-diagnostic-record", "proxyDiagnosticId"],
  ["suite", "suiteId"],
  ["attempt", "lifecycleStatus"],
  ["run", "inputHash"],
  ["run", "seedSet"],
  ["dependency-cache-snapshot", "dependencyCacheSnapshotId"],
];

function detectDocumentKind(document: unknown): DocumentKind {
  if (!isRecord(document)) return "task";

  for (const [kind, marker] of KIND_MARKERS) {
    if (Object.hasOwn(document, marker)) return kind;
  }

  return Object.hasOwn(document, "runId") ? "result" : "task";
}

function validateDocument(document: unknown, kind: DocumentKind): ContractValidationResult {
  if (
    isRecord(document)
    && Number.isInteger(document.schemaVersion)
    && document.schemaVersion !== SUPPORTED_SCHEMA_MAJOR
  ) {
    return {
      valid: false,
      kind,
      errors: [{
        code: "schema.unsupported_major",
        location: "/schemaVersion",
        message: `Unsupported ${kind} schema major version ${document.schemaVersion}`,
      }],
    };
  }

  const validator = validators[kind];
  if (!validator(document)) {
    return {
      valid: false,
      kind,
      errors: (validator.errors ?? []).map(structuralError),
    };
  }

  const validated = document as {
    schemaVersion: number;
    id?: string;
    version?: number;
    runId?: string;
    task?: { id: string; version: number };
  };
  if (kind === "result") {
    return {
      valid: true,
      kind,
      runId: validated.runId!,
      taskId: validated.task!.id,
      version: validated.task!.version,
      schema: {
        id: schemas.result.$id,
        draft: schemas.result.$schema,
        version: validated.schemaVersion,
      },
    };
  }

  if (kind === "task") {
    return {
      valid: true,
      kind,
      taskId: validated.id!,
      version: validated.version!,
      schema: {
        id: schemas.task.$id,
        draft: schemas.task.$schema,
        version: validated.schemaVersion,
      },
    };
  }

  return {
    valid: true,
    kind,
    version: validated.schemaVersion,
    schema: {
      id: schemas[kind].$id,
      draft: schemas[kind].$schema,
      version: validated.schemaVersion,
    },
  };
}

function validateFile(path: string, kind?: DocumentKind): ContractValidationResult {
  const loaded = loadDocument(path);
  if ("error" in loaded) {
    return {
      valid: false,
      ...(kind ? { kind } : {}),
      errors: [loaded.error],
    };
  }

  return validateDocument(loaded.document, kind ?? detectDocumentKind(loaded.document));
}

export function validateContractFile(path: string): ContractValidationResult {
  return validateFile(path);
}

export function validateContractDocument(
  document: unknown,
  kind?: DocumentKind,
): ContractValidationResult {
  return validateDocument(document, kind ?? detectDocumentKind(document));
}

export function validateTaskFile(path: string): TaskValidationResult {
  return validateFile(path, "task") as TaskValidationResult;
}

export function validateResultFile(path: string): ResultValidationResult {
  return validateFile(path, "result") as ResultValidationResult;
}

function sortedBundleFiles(directory: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sortedBundleFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function sha256(value: Buffer | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function checksumTaskBundle(path: string): BundleChecksumResult {
  try {
    const input = lstatSync(path);
    let root: string;
    let paths: string[];

    if (input.isDirectory()) {
      root = path;
      paths = sortedBundleFiles(root);
    } else if (input.isFile()) {
      root = path;
      paths = [path];
    } else {
      return {
        errors: [{
          code: "bundle.invalid_input",
          location: "",
          message: "Task Bundle input must be a directory or regular file",
        }],
      };
    }

    const files = paths
      .map((filePath) => ({
        path: input.isDirectory()
          ? relative(root, filePath).split(sep).join("/")
          : basename(filePath),
        sha256: sha256(readFileSync(filePath)),
      }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const bundleHash = createHash("sha256");
    for (const file of files) {
      bundleHash.update(file.path);
      bundleHash.update("\0");
      bundleHash.update(file.sha256);
      bundleHash.update("\n");
    }

    return {
      bundleChecksum: `sha256:${bundleHash.digest("hex")}`,
      files,
    };
  } catch (error) {
    return {
      errors: [{
        code: "bundle.read_error",
        location: "",
        message: error instanceof Error ? error.message : "Unable to read Task Bundle",
      }],
    };
  }
}

interface LockedPackage {
  name: string;
  version: string;
  integrity: string;
}

type LockResult =
  | { packages: LockedPackage[] }
  | { code: PreflightCode };

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TEXT_EXTENSIONS = new Set([
  ".css", ".env", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".text",
  ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const CREDENTIAL_PATTERNS = [
  { kind: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g },
  { kind: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  {
    kind: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    kind: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    kind: "credential",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b["']?\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/gi,
  },
];

export function containsObviousCredential(value: string): boolean {
  return CREDENTIAL_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function redactCredentials(value: string): string {
  return CREDENTIAL_PATTERNS.reduce((redacted, { kind, pattern }) => {
    pattern.lastIndex = 0;
    return redacted.replace(pattern, `[REDACTED:${kind}]`);
  }, value);
}

export function redactCredentialValues<T>(value: T): T {
  if (typeof value === "string") return redactCredentials(value) as T;
  if (Array.isArray(value)) return value.map(redactCredentialValues) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const normalized = key.replaceAll(/[-_]/g, "").toLowerCase();
    const credentialKey = [
      "apikey", "accesstoken", "authtoken", "clientsecret", "password",
    ].includes(normalized);
    return [key, credentialKey ? "[REDACTED:credential]" : redactCredentialValues(child)];
  })) as T;
}

function lockError(file: string, location: string, message: string): LockResult {
  return {
    code: {
      code: "DEPENDENCY_LOCK_INVALID",
      file,
      location,
      message,
    },
  };
}

function packageManagerName(value: string): "npm" | "pnpm" | undefined {
  const match = /^(npm|pnpm)(?:@.+)?$/.exec(value);
  return match?.[1] as "npm" | "pnpm" | undefined;
}

function pnpmPackageNameAndVersion(packageId: string): [string, string] | undefined {
  const withoutSlash = packageId.startsWith("/") ? packageId.slice(1) : packageId;
  const peerSuffix = withoutSlash.indexOf("(");
  const base = peerSuffix === -1 ? withoutSlash : withoutSlash.slice(0, peerSuffix);
  const versionSeparator = base.lastIndexOf("@");
  if (versionSeparator <= 0) return undefined;

  const name = base.slice(0, versionSeparator);
  const version = base.slice(versionSeparator + 1);
  return EXACT_VERSION.test(version) ? [name, version] : undefined;
}

function readPnpmLock(path: string, file: string): LockResult {
  let document: unknown;
  try {
    if (!lstatSync(path).isFile()) {
      return lockError(file, "", "pnpm lockfile must be a regular file");
    }
    document = parse(readFileSync(path, "utf8"));
  } catch {
    return lockError(file, "", "pnpm lockfile is missing or unreadable");
  }

  if (!isRecord(document) || document.lockfileVersion === undefined) {
    return lockError(file, "/lockfileVersion", "pnpm lockfileVersion is required");
  }
  if (!isRecord(document.packages)) {
    return lockError(file, "/packages", "pnpm lockfile packages map is required");
  }

  const packages: LockedPackage[] = [];
  for (const [packageId, value] of Object.entries(document.packages)) {
    const packageLocation = pointer("/packages", packageId);
    const parsedId = pnpmPackageNameAndVersion(packageId);
    if (!parsedId) {
      return lockError(file, packageLocation, `Package ${packageId} is not pinned to an exact version`);
    }

    const resolution = isRecord(value) && isRecord(value.resolution) ? value.resolution : undefined;
    if (!resolution || typeof resolution.integrity !== "string" || !resolution.integrity) {
      return lockError(
        file,
        `${packageLocation}/resolution/integrity`,
        `Package ${packageId} is missing an integrity field`,
      );
    }

    packages.push({ name: parsedId[0], version: parsedId[1], integrity: resolution.integrity });
  }

  return { packages: packages.sort((left, right) => {
    const leftId = `${left.name}@${left.version}`;
    const rightId = `${right.name}@${right.version}`;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }) };
}

function readNpmLock(path: string, file: string): LockResult {
  let document: unknown;
  try {
    if (!lstatSync(path).isFile()) {
      return lockError(file, "", "npm lockfile must be a regular file");
    }
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return lockError(file, "", "npm lockfile is missing, unreadable, or invalid JSON");
  }

  if (!isRecord(document) || document.lockfileVersion === undefined) {
    return lockError(file, "/lockfileVersion", "npm lockfileVersion is required");
  }
  if (!isRecord(document.packages)) {
    return lockError(file, "/packages", "npm lockfile packages map is required");
  }

  const packages: LockedPackage[] = [];
  for (const [packagePath, value] of Object.entries(document.packages)) {
    if (!packagePath || !isRecord(value) || value.link === true) continue;

    const marker = "node_modules/";
    const markerIndex = packagePath.lastIndexOf(marker);
    const name = markerIndex === -1 ? "" : packagePath.slice(markerIndex + marker.length);
    const packageLocation = pointer("/packages", packagePath);
    if (!name || typeof value.version !== "string" || !EXACT_VERSION.test(value.version)) {
      return lockError(file, `${packageLocation}/version`, `Package ${packagePath} is not pinned`);
    }
    if (typeof value.integrity !== "string" || !value.integrity) {
      return lockError(
        file,
        `${packageLocation}/integrity`,
        `Package ${name}@${value.version} is missing an integrity field`,
      );
    }

    packages.push({ name, version: value.version, integrity: value.integrity });
  }

  return { packages: packages.sort((left, right) => {
    const leftId = `${left.name}@${left.version}`;
    const rightId = `${right.name}@${right.version}`;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }) };
}

function reject(code: PreflightCode | PreflightCode[]): PreflightResult {
  return { preflight: "rejected", codes: Array.isArray(code) ? code : [code] };
}

export function preflightTaskBundle(bundlePath: string): PreflightResult {
  const taskFile = "task.yaml";
  const taskPath = join(bundlePath, taskFile);
  const taskValidation = validateTaskFile(taskPath);
  if (!taskValidation.valid) {
    return reject(taskValidation.errors.map((error) => ({ ...error, file: taskFile })));
  }

  const loadedTask = loadDocument(taskPath);
  if ("error" in loadedTask || !isRecord(loadedTask.document)) {
    return reject({ ...("error" in loadedTask ? loadedTask.error : {
      code: "document.parse_error",
      location: "",
      message: "Task document must be an object",
    }), file: taskFile });
  }

  const permissions = loadedTask.document.permissions;
  const writablePaths = isRecord(permissions) && Array.isArray(permissions.writablePaths)
    ? permissions.writablePaths.filter((value): value is string => typeof value === "string")
    : [];
  if (!writablePathPrefixes(writablePaths)) {
    return reject({
      code: "WORKSPACE_WRITABLE_PATH_INVALID",
      file: taskFile,
      location: "/permissions/writablePaths",
      message: "writablePaths must be terminal directory-prefix patterns such as src/**",
    });
  }

  const environment = loadedTask.document.environment;
  const declaredManager = isRecord(environment) ? environment.packageManager : undefined;
  const manager = typeof declaredManager === "string"
    ? packageManagerName(declaredManager)
    : undefined;
  if (!manager) {
    return reject({
      code: "DEPENDENCY_LOCK_INVALID",
      file: taskFile,
      location: "/environment/packageManager",
      message: `Unsupported package manager ${String(declaredManager)}`,
    });
  }

  const lockFile = manager === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json";
  const lockPath = join(bundlePath, lockFile);
  const lock = manager === "pnpm"
    ? readPnpmLock(lockPath, lockFile)
    : readNpmLock(lockPath, lockFile);
  if ("code" in lock) return reject(lock.code);

  const extensions = loadedTask.document.extensions;
  const snapshotReference = isRecord(extensions)
    ? extensions.dependencyCacheSnapshot
    : undefined;
  if (typeof snapshotReference !== "string" || !snapshotReference) {
    return reject({
      code: "DEPENDENCY_CACHE_MISS",
      file: taskFile,
      location: "/extensions/dependencyCacheSnapshot",
      message: "Task must reference a dependency cache snapshot",
    });
  }

  const snapshotPath = resolve(bundlePath, snapshotReference);
  const snapshotRelativePath = relative(bundlePath, snapshotPath);
  if (
    snapshotRelativePath === ".."
    || snapshotRelativePath.startsWith(`..${sep}`)
    || isAbsolute(snapshotRelativePath)
  ) {
    return reject({
      code: "DEPENDENCY_CACHE_MISS",
      file: taskFile,
      location: "/extensions/dependencyCacheSnapshot",
      message: "Dependency cache snapshot must be inside the Task Bundle",
    });
  }

  const snapshotFile = snapshotRelativePath.split(sep).join("/");
  try {
    if (!lstatSync(snapshotPath).isFile()) throw new Error("not a regular file");
  } catch {
    return reject({
      code: "DEPENDENCY_CACHE_MISS",
      file: snapshotFile,
      location: "",
      message: "Referenced dependency cache snapshot is missing or invalid",
    });
  }
  const snapshotValidation = validateFile(snapshotPath, "dependency-cache-snapshot");
  const loadedSnapshot = loadDocument(snapshotPath);
  if (!snapshotValidation.valid || "error" in loadedSnapshot || !isRecord(loadedSnapshot.document)) {
    return reject({
      code: "DEPENDENCY_CACHE_MISS",
      file: snapshotFile,
      location: snapshotValidation.valid ? "" : snapshotValidation.errors[0]?.location ?? "",
      message: "Referenced dependency cache snapshot is missing or invalid",
    });
  }

  const snapshotExtensions = loadedSnapshot.document.extensions;
  const cachedPackages = isRecord(snapshotExtensions) && Array.isArray(snapshotExtensions.packages)
    ? snapshotExtensions.packages
    : [];
  const cachedKeys = new Set(cachedPackages.flatMap((value) =>
    isRecord(value)
      && typeof value.name === "string"
      && typeof value.version === "string"
      && typeof value.integrity === "string"
      ? [`${value.name}@${value.version}\0${value.integrity}`]
      : []));
  const missingPackages = lock.packages
    .filter((value) => !cachedKeys.has(`${value.name}@${value.version}\0${value.integrity}`))
    .map((value) => `${value.name}@${value.version}`);
  if (missingPackages.length > 0) {
    return reject({
      code: "DEPENDENCY_CACHE_MISS",
      file: snapshotFile,
      location: "/extensions/packages",
      message: `Dependency cache snapshot is missing: ${missingPackages.join(", ")}`,
      missingPackages,
    });
  }

  for (const filePath of sortedBundleFiles(bundlePath)) {
    if (!TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) continue;

    const lines = readFileSync(filePath, "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (containsObviousCredential(lines[index]!)) {
        return reject({
          code: "DATA_SCAN_CREDENTIAL_DETECTED",
          file: relative(bundlePath, filePath).split(sep).join("/"),
          location: `/line/${index + 1}`,
          message: "Bundle text contains an obvious credential pattern",
        });
      }
    }
  }

  return { preflight: "passed" };
}

export function readPreflightedTaskBundle(bundlePath: string): PreflightedTaskBundle {
  const loadedTask = loadDocument(join(bundlePath, "task.yaml"));
  if ("error" in loadedTask || !isRecord(loadedTask.document)) {
    throw new Error("Preflighted Task document is unavailable");
  }

  const task = loadedTask.document;
  const budgets = task.budget;
  const permissions = task.permissions;
  const environment = task.environment;
  const extensions = task.extensions;
  const snapshotReference = isRecord(extensions)
    ? extensions.dependencyCacheSnapshot
    : undefined;
  if (!isRecord(budgets) || typeof snapshotReference !== "string") {
    throw new Error("Preflighted Task metadata is invalid");
  }

  const loadedSnapshot = loadDocument(resolve(bundlePath, snapshotReference));
  if ("error" in loadedSnapshot || !isRecord(loadedSnapshot.document)) {
    throw new Error("Preflighted dependency cache snapshot is unavailable");
  }

  const snapshot = loadedSnapshot.document;
  if (
    typeof task.id !== "string"
    || typeof task.version !== "number"
    || typeof task.schemaVersion !== "number"
    || !isRecord(environment)
    || typeof environment.image !== "string"
    || typeof budgets.maxWallTimeSeconds !== "number"
    || typeof budgets.maxAgentSteps !== "number"
    || typeof budgets.maxCostUsd !== "number"
    || !isRecord(permissions)
    || !Array.isArray(permissions.writablePaths)
    || !permissions.writablePaths.every((value) => typeof value === "string")
    || !Array.isArray(permissions.forbiddenPaths)
    || !permissions.forbiddenPaths.every((value) => typeof value === "string")
    || typeof snapshot.lockfileHash !== "string"
    || typeof snapshot.dependencyCacheSnapshotId !== "string"
    || typeof snapshot.imageDigest !== "string"
  ) {
    throw new Error("Preflighted Task Bundle metadata is invalid");
  }

  return {
    taskId: task.id,
    version: task.version,
    schemaVersion: task.schemaVersion,
    environmentImage: environment.image,
    imageDigest: snapshot.imageDigest,
    budgets: {
      maxWallTimeSeconds: budgets.maxWallTimeSeconds,
      maxAgentSteps: budgets.maxAgentSteps,
      maxCostUsd: budgets.maxCostUsd,
    },
    permissions: {
      writablePaths: permissions.writablePaths,
      forbiddenPaths: permissions.forbiddenPaths,
    },
    dependencyLockHash: snapshot.lockfileHash,
    dependencyCacheSnapshotId: snapshot.dependencyCacheSnapshotId,
  };
}

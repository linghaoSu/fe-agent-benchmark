# Implementation Log — frontend-agent-benchmark

## 2026-07-17 — V0 contracts and deterministic fixtures

### Scope

- Added only the root pnpm/TypeScript scaffold, `apps/cli`, and
  `packages/contracts`.
- Implemented `pnpm eval validate <task-yaml>` as pure contract validation.
- Tightened the Task schema and kept the published Task example valid.
- Added three requested invalid fixtures and public-seam tests.
- Did not create or implement sandbox, persistence, adapters, evaluators,
  networking, export, API, or Dashboard modules.

### Decisions

- `schemaVersion` is an integer major version, consistent with the existing
  Result schema; V0 supports major `1`.
- Draft 2020-12 structural validation runs before the semantic major-version
  check.
- Contract failures use dotted stable codes and JSON Pointer locations.
- The CLI owns argument parsing and output only; validation remains in
  `packages/contracts`.
- The root pnpm reporter is silent so the documented CLI seam emits JSON-only
  stdout through `pnpm eval`.

### Verification

- `pnpm install`: passed.
- `pnpm build`: passed.
- `pnpm typecheck`: passed.
- `node --test tests/gate/v0-contract-validation.test.mjs`: passed, 1/1.
- `node --test tests/gate/v0-contract-errors.test.mjs`: passed, 3/3.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: reused the recorded red public-seam gate;
  retained `GATE-V0-001` unmodified and recorded green evidence.
- `secret-scanner:scan-secrets --mode working`: passed with no findings.

### Residual Risks / Next Stage

- V0 intentionally validates contracts only; runtime preflight and execution
  behavior require later separately gated stages.

## 2026-07-17 — V0.2 Result contracts and Task Bundle checksum

### Scope and decisions

- Tightened only `result.schema.json`, preserving the Result example while
  adding its explicit optional `extensions` namespace.
- A top-level `runId` deterministically selects Result validation; the CLI help
  documents that all other documents select Task validation.
- Kept checksum ownership in `packages/contracts` for this slice: directories
  recurse through regular files, skip symlinks, globally sort relative paths,
  and hash each file before hashing the manifest.
- Generated committed Task/Result types with a small deterministic Node script;
  no registry dependency was added.
- Did not implement any V0.3/V0.4 or runtime-stage subsystem.

### Verification

- `pnpm install`: passed.
- `pnpm -r build`: passed.
- `node --test tests/gate/*.test.mjs`: passed, 10/10.
- `pnpm check:generated`: passed.
- `pnpm eval validate examples/result.json`: passed with structured Result JSON.
- `pnpm eval checksum examples/task.yaml`: passed with one file and SHA-256 output.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded public-seam red evidence before
  implementation and the final 10/10 green result.
- `secret-scanner:scan-secrets --mode working`: passed with no findings.

### Residual Risks / Next Stage

- The schema type generator intentionally supports the constructs used by the
  two V0 schemas; replace it with a standard compiler when schema composition is
  introduced.
- V0.3/V0.4 work remains explicitly out of scope.

## 2026-07-17 — V0.3 canonical contract matrix

### Scope and decisions

- Added the sixteen remaining Draft 2020-12 schemas and synthetic fixture
  matrices; the matrix also covers the existing Task and Result schemas.
- Used architecture-named top-level markers for deterministic content routing.
  Exclusive markers precede shared references; Result remains the `runId`
  fallback before Task.
- Unknown integer majors are rejected before structural validation, so the
  stable `schema.unsupported_major` error wins even when another defect exists.
- Extended the local generator only for schema composition and generated a
  barrel export; drift checking now compares every generated file directly.
- Kept cross-record closure, state transitions, checksum verification, scan
  execution, export execution, preflight classifications, persistence, and
  protocol I/O out of V0.3.

### Verification

- `pnpm install`: passed.
- `pnpm -r build`: passed.
- `node --test tests/gate/*.test.mjs`: passed, 28/28.
- `pnpm check:generated`: passed.
- `node --test tests/gate/v0-contract-matrix.test.mjs`: passed, 18/18.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded 0/18 red before production changes
  and 18/18 focused green after implementation.
- `secret-scanner:scan-secrets --mode working`: passed with 0 findings.

### Residual Risks / Next Stage

- Architecture-silent representation choices are documented in
  `schemas/README.md`; later stages own semantic consistency and execution.
- V0.4 preflight classification codes remain explicitly out of scope.

## 2026-07-17 — V1.1 SQLite state store and immutable Run creation

### Scope and decisions

- Used built-in `node:sqlite` on Node 26; added one checksum-bound, forward-only
  migration with timestamped backup and unknown-newer refusal.
- Added explicit Task/Run repository interfaces. Run insertion and its
  `CREATED → PREFLIGHT` transition commit in one transaction; resolved input
  columns and transitions are protected by SQLite triggers.
- Run creation preserves the existing static preflight result, stores canonical
  JSON plus its SHA-256, and atomically writes/fsyncs/renames derived
  `input.json`. `run show --repair` regenerates the exact stored bytes.
- Kept Attempts, leases, broader reconciliation, sandboxing, adapters,
  evaluators, Artifact staging, and export out of V1.1.

### Verification

- `pnpm install`: passed.
- `pnpm -r build`: passed.
- `node --test tests/gate/v1-state-store.test.mjs`: passed, 6/6.
- `node --test tests/gate/*.test.mjs`: passed, 40/40.
- `pnpm check:generated`: passed.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded 0/6 red before production edits and
  6/6 focused green after implementation.
- `idea-to-ship:implement`: kept the stage to the approved V1.1 boundaries and
  left all changes uncommitted.

### Residual Risks / Next Stage

- V1.2/V1.3 own Attempt lifecycle, execution leases, and startup reconciliation.

## 2026-07-17 — V1.2 Attempt lifecycle and no-op Run executor

### Scope and decisions

- Added checksum-bound forward migration 2 without changing migration 1. It
  preserves Run transitions in `run_transitions` and adds Attempts,
  Attempt-level append-only transitions, typed producer records, ordinal 1–2,
  and database protection for finalized Agent outcomes.
- Added `packages/run-coordinator` with the architecture state maps, no-op
  Agent/Evaluator, Agent/evaluator/infrastructure fault fakes, and a
  post-commit transition hook for interruption tests.
- Agent adapter/budget/cancel outcomes cross the freeze/evaluation barrier and
  finish lifecycle `SUCCEEDED`; their orthogonal execution classification is
  retained. Evaluator failure and exhausted infrastructure retry finish the
  Run `FAILED`.
- `eval run execute` drives one existing PREFLIGHT Run. `run show` now returns
  Attempts, Attempt transitions, and producer records without changing the
  existing Run/input repair fields.
- Kept Docker, adapter protocol, real evaluators, leases/reconciliation,
  Artifact staging/scanning, and export out of V1.2.

### Verification

- Red gate: `node --test tests/gate/v1-run-lifecycle.test.mjs` failed 0/7 for
  missing CLI/coordinator behavior before production edits.
- Focused green: the same command passed 7/7.
- `pnpm install`: passed.
- `pnpm -r build`: passed.
- `node --test tests/gate/*.test.mjs`: passed 47/47.
- `pnpm check:generated`: passed.

### Residual risks / Next stage

- V1.3 owns real external execution, leases/startup reconciliation, cleanup and
  retry absence proof, and Artifact staging/manifest/scanning.

## 2026-07-17 — V1.3 execution lease, Artifact commit, and reconciliation

### Scope and decisions

- Added checksum-bound migration 3 with `execution_leases`, `artifacts`,
  `manifests`, and immutable canonical `results`; migration work uses an
  exclusive SQLite transaction plus the named migration lease once available.
- The global executor lease records owner UUID/PID/start identity, heartbeats
  during execution and at transition boundaries, releases in `finally`, and
  permits takeover only after dead-PID or changed-incarnation proof.
- Added `packages/artifact-store-fs`: no-follow staging under
  `<run>/.tmp/<attempt>`, per-file fsync/SHA-256, deterministic text credential
  scan, manifest-last publication, atomic Attempt rename/parent fsync, final
  checksum verification, and one SQLite manifest/Artifact transaction.
- The no-op path writes `agent-events.jsonl` and
  `evaluator-results/noop.json`. After `AGGREGATING`, it stores canonical
  Result JSON/checksum in SQLite, atomically writes/verifies `result.json`, and
  only then transitions to `COMPLETED`.
- `eval run doctor` holds the execution lease, quarantines partial staging,
  reports orphan manifests, regenerates derived input/Result bytes from
  SQLite, and verifies every finalized Artifact and manifest before reporting
  healthy. `run show` remains lease-free and read-only.
- Unsupported non-text Artifact scanning fails closed. The isolated scanner
  worker and full binary/archive/image coverage remain explicitly out of scope.

### Verification

- Red gate: `node --test tests/gate/v1-lease-artifacts.test.mjs` failed 0/7
  for the intended missing V1.3 seams before production edits.
- Focused green: the same command passed 7/7.
- Existing V1.1/V1.2 focused gates passed 13/13.
- `pnpm install`: passed, exit 0.
- `pnpm -r build`: passed, exit 0.
- `node --test tests/gate/*.test.mjs`: passed 54/54.
- `pnpm check:generated`: passed, exit 0.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded test-first 0/7 red and 7/7 green.
- `harness-engineering:harness --mode audit`: all seven V1.3 layers passed;
  report written to `.harness-engineering/frontend-agent-benchmark/harness-audit.md`.
- `antifragile:antifragile-audit --scope system`: no critical or warning
  persistence/recovery findings after fail-closed MIME and lease-loss guards.

### Residual risks / next stage

- Docker cleanup/absence proof, adapter stdio, real evaluators, isolated
  scanner-worker coverage machinery, `state.json`, and export remain later
  explicitly scoped stages.

## 2026-07-17 — V1.4 requester-safe export with audit

### Scope and decisions

- Added checksum-bound migration 4 with append-only passed/denied export audit
  rows; export attempts do not mutate Run state.
- Added `packages/export-policy`: it rebuilds the requester Result from the
  schema allowlist, maps private execution outcomes through public taxonomy v1,
  copies only requester-safe Artifact bytes outside the Attempt tree, rejects
  private references/host paths/credentials, validates both schemas, and
  publishes the staged requester directory before recording success.
- Added `eval run export --audience requester <run-id>` with structured passed
  or denial output. V1.3 already emitted the required canonical Result and
  artifact audiences, so the coordinator was unchanged.
- Kept Docker/sandbox, adapter stdio, real evaluators, isolated scanner workers,
  and network policy enforcement out of scope.

### Verification

- Red gate: `node --test tests/gate/v1-export.test.mjs` failed 0/3 at the
  missing CLI route before production edits.
- Focused green: the same command passed 3/3.
- `pnpm install`: passed, exit 0.
- `pnpm -r build`: passed, exit 0.
- `node --test tests/gate/*.test.mjs`: passed 57/57.
- `pnpm check:generated`: passed, exit 0.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded the public-seam red/green evidence.
- `idea-to-ship:implement`: kept V1.4 within the approved architecture and left
  all changes uncommitted.

### Residual risks / next stage

- Broader binary/archive/image scanning remains owned by the later isolated
  scanner-worker stage; V1.4 fails closed outside the existing deterministic
  text/JSON scanner coverage.

## 2026-07-17 — V2.1 Adapter protocol runtime and Mock Adapter

### Scope and decisions

- Added `packages/adapter-protocol` with bounded UTF-8 JSONL parsing/encoding,
  canonical schema validation, strict per-direction sequencing, handshake,
  heartbeat, cancel deadline/kill, shutdown, and subprocess hosting.
- Added migration 5 and an append-only `adapter_frames` repository. Accepted
  inbound frames commit before event/tool dispatch; outbound frames commit
  before stdin writes. Duplicate sequences are ignored without a second row;
  gaps and invalid state terminate with stable private codes.
- Added `packages/adapter-mock`, a registered deterministic Node executable
  that handshakes, emits two events, requests the canned echo tool, and returns
  a Task/seed-derived patch. `SubprocessAgentPhase` stages requester-safe
  `agent-events.jsonl`/`patch.diff` and maintainer-only `adapter.stderr.log`.
- New Runs record `maxFrameBytes=65536` and
  `heartbeatTimeoutSeconds=1`; mock execution rejects legacy Runs lacking those
  immutable values. No-agent execution remains the existing no-op path.
- Missing-Run export now returns `RUN_NOT_FOUND` without an impossible audit
  row. A small freshness wrapper preserves `pnpm eval` auto-build behavior but
  reuses a preceding build, preventing concurrent gate processes from reading
  partially rewritten compiled modules.
- Kept the V2.2 Tool Router policy/budgets/truncation, Docker/sandbox/network
  policy, real evaluators/providers, and remote credentials out of scope.

### Verification

- Red gate: `node --test tests/gate/v2-adapter-protocol.test.mjs` failed 0/9
  before V2 production changes.
- Focused green: the same command passed 9/9.
- `pnpm install`: passed, exit 0.
- `pnpm -r build`: passed, exit 0.
- `node --test tests/gate/*.test.mjs`: passed 66/66.
- `pnpm check:generated`: passed, exit 0.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded the public-seam 0/9 red and 9/9
  green evidence.
- `harness-engineering:harness --mode audit`: all seven V2.1 layers passed;
  the addendum is in `.harness-engineering/frontend-agent-benchmark/harness-audit.md`.
- `antifragile:antifragile-audit --scope system`: no critical issue; spawn
  failure settlement and post-cancel dispatch were hardened. Hard Coordinator
  death/orphan cleanup remains assigned to the V3 process barrier.
- `secret-scanner:scan-secrets --mode working`: only the two existing explicit
  synthetic credential fixtures were reported; no V2.1 credential was found.

### Residual risks / next stage

- V3 must persist/clean subprocess ownership across a hard Coordinator death.
- V2.2 owns real Tool Router policy, budgets, and output truncation.

## 2026-07-17 — V2.2 Tool Router policy, budgets, truncation, and redaction

### Scope and decisions

- Added `packages/tool-router` with the public `ToolExecutor`, resolved policy
  table, normalized read/write prefixes, four fake in-memory tools, forbidden
  environment/config override detection, stable denial/budget codes, bounded
  argument persistence, counters, deterministic redaction, and private output
  Artifact references.
- Added migration 6 and the `tool_calls` repository. The coordinator persists
  the accepted redacted Adapter frame, then the accepted Tool Call row, before
  invoking the runner; the row completes with outcome, bytes, truncation,
  Artifact ref, and execution timestamp.
- Wired every production `tool_request` through one per-Attempt ToolExecutor.
  Policy denial returns a rejected `tool_result` and continues. Budget
  exhaustion emits `budget_update`, cancels the Adapter, and reuses the
  existing `budget_exhausted` Agent/lifecycle/producer path.
- Added an independent wall-time deadline so a cooperative heartbeat-only
  Adapter cannot evade the wall budget. Tool calls, output bytes, and wall time
  aggregate into canonical Result efficiency.
- Large redacted output is staged in a `maintainer_only` text Artifact and the
  protocol carries only its ref, truncation flag, and explicit marker. Adapter
  stderr and accepted frames are redacted before persistence.
- Adapter subprocesses no longer inherit host environment wholesale. The Mock
  Adapter accepts argv scenario JSON while its no-argument behavior remains
  unchanged.
- Kept real Docker/filesystem/command execution, network enforcement,
  evaluators, providers, and dependency proxy out of scope.

### Verification

- Test-first red: `node --test tests/gate/v2-tool-router.test.mjs` failed 0/1
  at the absent ToolExecutor package before production edits.
- Focused green: V2.2 passed 9/9; V2.1 plus V2.2 passed 18/18.
- `pnpm install`: passed, exit 0.
- `pnpm -r build`: passed, exit 0.
- `node --test tests/gate/*.test.mjs`: passed 75/75.
- `pnpm check:generated`: passed, exit 0.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded the public-seam red and expanded
  policy/budget/security/persistence green matrix.
- `harness-engineering:harness --mode audit`: no critical finding; V2.2
  addendum written to `.harness-engineering/frontend-agent-benchmark/harness-audit.md`.
- `antifragile:antifragile-audit --scope system`: no critical issue; the
  independent wall deadline closed the only active-phase gap. Interrupted
  accepted-row reconciliation is retained for the resumability stage.
- `secret-scanner:scan-secrets --mode working`: only the two existing explicit
  synthetic AWS fixtures were reported; no V2.2 credential was found.

### Residual risks / next stage

- A hard Coordinator death can leave a Tool Call visibly `accepted`; staged
  bytes are quarantinable and the Attempt remains non-terminal, but later
  resumability/orphan cleanup should annotate that incomplete row.
- Recommend `idea-to-ship:review --target code`; do not add real Sandbox or
  network behavior to this V2.2 seam.

## 2026-07-17 — V3.1 real Docker workspace Sandbox

### Scope and decisions

- Added `packages/sandbox-docker` as the existing `WorkspaceRunner` plus
  Attempt lifecycle hooks: daemon/local pinned-image preflight, create/start,
  container exec, deterministic patch capture, and idempotent cleanup.
- Docker create uses network none, read-only root, UID/GID 1000, dropped
  capabilities, no-new-privileges, memory/CPU/PID limits, a read-only public
  bundle, explicit writable prefix mounts, nested read-only protected mounts,
  separate `/tmp`, and optional excluded build-output mounts.
- Kept Tool Router ownership unchanged: policy, budgets, persistence,
  truncation, redaction, and environment denial all run before/after the real
  workspace runner exactly as they did for the fake.
- Run creation records the selected `fake|docker` runner, pinned image
  reference/digest, non-root user, and limits. Execution rejects a mismatched
  `--sandbox`; fake remains the default.
- Coordinator now captures the runtime workspace patch and proves cleanup
  before `WORKSPACE_FROZEN`. Stable daemon/image/start/patch/cleanup codes map
  to `infrastructure_error`; cleanup failure cannot produce Attempt success.
- Added terminal directory-prefix validation (`src/**`) to Task preflight.
  Unsupported wildcard shapes fail before Run creation.
- Kept V3.2 networks/Mock API/proxy policy, V3.3 process census/snapshot
  digest/no-follow collector, browsers, and evaluators out of scope.

### Verification

- Test-first red: `node --test tests/gate/v3-sandbox-unit.test.mjs` failed 0/4
  at the missing `packages/sandbox-docker` public seam.
- Focused green: 4/4 unit gates passed; the real-Docker gate registered an
  explicit `DOCKER_UNAVAILABLE` skip because the managed shell was denied
  access to `/Users/sulinghao/.orbstack/run/docker.sock`.
- `pnpm install`: passed, exit 0.
- `pnpm -r build`: passed, exit 0.
- `node --test tests/gate/*.test.mjs`: 79 passed, 0 failed, 1 skipped.
- `pnpm check:generated`: passed, exit 0.

### Cross-Skill Checks

- `idea-to-ship:test --mode gate`: recorded missing-module red and focused/full
  green evidence at public seams.
- `harness-engineering:harness --mode audit`: all seven V3.1 layers passed;
  the only evidence gap is the unavailable real daemon socket, recorded in
  `.harness-engineering/frontend-agent-benchmark/harness-audit.md`.
- `antifragile:antifragile-audit --scope system`: found one unbounded Docker
  CLI wait; all Docker and patch subprocesses are now bounded by the Run wall
  limit, and the focused/full gates remained green.
- `secret-scanner:scan-secrets --mode working`: no V3.1 finding; only the two
  pre-existing intentional AWS credential-denial fixtures were reported.

### Residual risks / next stage

- Run the real-Docker gate from a shell that can access OrbStack before calling
  the OS-enforcement evidence complete.
- V3.2 owns per-Attempt network/proxy enforcement; V3.3 owns crash-orphan
  census, immutable snapshot digest, and no-follow host collection.

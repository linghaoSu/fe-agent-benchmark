# Implementation Log — frontend-agent-benchmark

## 2026-09-10 — V4.2a app start and host-only functional evaluation

- Added the `start` evaluator after build. It launches the declared command in
  the evaluation container, probes `http://app:<port>/api/health` from that
  internal network, records `build/start.log`, and fails as `START_TIMEOUT`.
- Added an opaque-spec Playwright evaluator in a separate non-root, read-only,
  tmpfs browser container on the same internal network. The browser image is
  pinned to `mcr.microsoft.com/playwright:v1.59.1-noble@sha256:b0ab6f3cb99aa7803adbc14d9027ec1785fc6e433b97e134e0f8fe61683b6b53`.
- `evaluator/` is removed before every Agent mount and frozen snapshot; hidden
  test source remains host-only. Functional artifacts contain sanitized JSON
  outcomes and maintainer-only raw browser output.
- Aggregation now reports functional gate state and score, and requires a
  passing critical functional gate when the Task requires it.

## 2026-09-09 — V3.3 phase barrier and immutable snapshot

- The Agent boundary records a maintainer-only process census, materializes a
  no-follow snapshot with a checksum-bound exclusion manifest, and persists its
  digest on the Attempt. Unsafe entries and residual processes are terminal,
  non-retryable outcomes; snapshots are recursively read-only.
- Deferred verification adds fake-client ordering/quarantine/retry gates,
  closes ToolExecutor after the freeze barrier with `TOOL_ROUTER_CLOSED`, and
  adds mock Docker residual-process and unsafe-entry scenarios. Cleanup failure
  is retryable once as infrastructure; residual/unsafe outcomes remain invalid
  and non-retryable. Real-Docker gates skip only on `DOCKER_UNAVAILABLE`.

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

## 2026-09-09 — V3.2 controlled package proxy

### Scope and decisions

- Added only the fixture-directory mount and fixed npm registry environment to
  the existing per-Attempt proxy service. The service remains a pinned Node
  image with a small static HTTP command; no registry dependency was added.
- Added the required Task `fixtureDirectory` field and regenerated the existing
  contract type. Proxy unavailability now records a schema-validated,
  maintainer-only diagnostic Artifact and infrastructure producer record before
  the existing single retry.
- Allowed Artifact finalization for a failed Attempt so pre-Agent diagnostics
  remain durable. V3.3, browsers, evaluation networking, and real registry
  access remain out of scope.

### Verification

- Test-first red: `v3-proxy.test.mjs` failed because the proxy was neither
  mounted nor injected into the Agent environment.
- Focused green: 4 passed / 0 failed / 1 skipped; the skip is the real Docker
  `npm ci` gate and is explicitly `DOCKER_UNAVAILABLE` in this managed shell.
- `pnpm install`, `pnpm -r build`, and `pnpm check:generated` passed. The
  serialized full gate suite began cleanly but did not reach its TAP summary
  before this managed host's 30-second command window; run it on a quieter host.
## 2026-09-09 — V4.1 evaluator core (partial vertical slice)

### Scope and decisions

- Added `evaluator-core` with ordered plugin execution, prerequisite skips,
  schema validation, stable evaluator error conversion, and maintainer-only
  evaluator result staging.
- Added deterministic `evaluator-integrity` patch policy checks and
  `evaluator-build` ordered command execution with bounded logs.
- Kept the existing coordinator/CLI `NoopEvaluator` path unchanged while the
  pipeline-to-coordinator integration, COW evaluation Docker runtime, fixture,
  and real-Docker acceptance gate are completed in the next vertical slice.

### Verification

- Test-first red: missing V4 gate file.
- Focused green: `pnpm -r build`; `node --test --test-concurrency=1
  tests/gate/v4-evaluators.test.mjs`; `pnpm check:generated`.

## 2026-09-09 — V4.1b evaluator pipeline wiring

### Scope and decisions

- Added the pipeline evaluation phase: it copies the frozen snapshot into a
  separate evaluation workspace, starts an attempt-suffixed Docker runtime,
  checks the immutable snapshot digest around untrusted build commands, stages
  evaluator evidence, and always removes the evaluation runtime.
- CLI defaults to `--evaluators pipeline` for Docker and preserves `noop` for
  fake sandboxes. Result aggregation now derives `valid`, `solved`, build
  score, evaluator digest, and explicit not-evaluated functional gate state.
- Added the offline `node-min` fixture and mock build/forbidden-write scenarios.

### Verification

- `pnpm install`, `pnpm build`, focused V4 evaluator gates (3/3), and
  `pnpm check:generated` passed.
- Docker verification could not run: `docker info` reaches an OrbStack socket
  but is denied by the managed execution sandbox (`operation not permitted`).

## 2026-09-10 — V4.2b real React orders task bundle

### Scope and decisions

- Added `datasets/tasks/react-orders-filter-017`: an offline React 19 task
  bundle with a pinned Alpine Node image, static package proxy, npm lockfile,
  dependency cache snapshot, public starter, host-only gold source, and hidden
  Playwright functional cases.
- The no-bundler build writes browser ESM wrappers around the vendored React,
  React DOM, and Scheduler CommonJS development builds; no esbuild or extra
  Alpine-specific package is needed.
- `references/` is now omitted from Docker's public Agent bundle. The mock
  adapter receives the host gold directory only for `react-orders-gold` and
  emits ordinary allowed `write_file` requests; `react-orders-noop` changes
  nothing.

### Verification

- `pnpm eval validate datasets/tasks/react-orders-filter-017/task.yaml` and
  `pnpm eval checksum datasets/tasks/react-orders-filter-017` passed.
- Focused V4.2b static gates passed; the real Docker gold/noop gates skipped
  cleanly because the managed shell cannot access OrbStack.

### V4.1 coverage follow-up

- Added serialized unit coverage for the full integrity/build aggregation truth
  table, evaluator-error and digest-mismatch terminal handling, Result schema
  validation, and evaluator evidence-reference closure.
- Added serialized real-Docker CLI coverage for `build-pass`, `build-break`,
  and `forbidden-write`, including evaluator-result schema validation,
  requester export redaction, `run show` snapshot/evaluator visibility, and
  attempt/evaluation container plus network cleanup.
- The maintainer’s five real-Docker fixes are now covered: writable evaluation
  copy, in-place frozen-snapshot digest, `fixtureDirectory` metadata,
  independent evaluation-command timeout, and the corrected fixture integrity.
- A red gate exposed missing evidence closure; the minimal coordinator guard
  now fails the Attempt with `EVALUATOR_EVIDENCE_REF_DANGLING` before a Result
  can be created.

## 2026-09-10 — V5.1 Visual, Responsive and Accessibility evaluators

### Scope and decisions

- Added `packages/evaluator-visual` (full-page PNG per viewport in the pinned
  Playwright container with reduced motion, animation/caret suppression and
  `document.fonts.ready`; pure-Node PNG decoder; per-viewport mismatch ratio
  against `evaluator/hidden/baselines/<viewport>.png`; score
  `1 − clamp(mismatch / threshold)`; missing baselines → `skipped`
  `VISUAL_BASELINE_MISSING`), `packages/evaluator-responsive` (document/body
  scroll width, `[data-testid]` right-edge and zero-size checks →
  `RESPONSIVE_OVERFLOW` / `RESPONSIVE_LAYOUT_DEFECT`) and
  `packages/evaluator-a11y` (vendored axe-core 4.10.3 injected via
  `addScriptTag` with wcag2a/wcag2aa plus six deterministic builtin DOM rules;
  serious/critical violations → `A11Y_VIOLATIONS`).
- Screenshots are staged as `screenshots/<viewport>.png.json` (base64 + sha256)
  because the artifact store scans only text/JSON; geometry, diff and a11y
  evidence are bounded JSON with no hidden text or full DOM.
- Task metadata now carries `viewports`, `environment.locale/timezone`,
  `evaluation.weights` and optional `evaluation.visual.mismatchThreshold`;
  aggregation fills `scores.visual/responsive/accessibility`, records each
  dimension's status under `extensions.dimensions`, and adds an informational
  weighted `extensions.quality` over evaluated dimensions. `valid`/`solved`
  are untouched by these dimensions.
- `pnpm eval baseline <task-dir>` runs the gold scenario in a throwaway
  database and writes real PNG baselines into the hidden bundle.
- Kept Engineering evaluator, Alternative/Mutation calibration report and the
  deterministic repeat comparator for V5.2.

### Verification

- Unit gates: v5-visual 9/9, v5-responsive 9/9, v5-a11y 8/8, v5-quality 2 unit
  + 2 real-Docker scenarios — all green.
- Real Docker gold run: visual 0.94, responsive 1, accessibility 1, quality
  0.9867, solved=true; overflow mutation: responsive 0.33, solved unchanged.
- Full serial suite result recorded below after the run.
- `node --test --test-concurrency=1 tests/gate/*.test.mjs`: 146 gates, 145
  passed on the first run; the single failure (GATE-V2.2-003, adapter handshake
  under host load) passed 9/9 on an immediate isolated rerun. `pnpm build` and
  `pnpm check:generated` exit 0.

## 2026-09-10 — V5.2 Engineering evaluator, calibration and repeat comparator

### Scope and decisions

- Added `packages/evaluator-engineering` (informational, prerequisite build):
  change footprint, dependency-manifest changes, generated/build output,
  debug leftovers, hardcoded test data heuristic, and tests-touched-with-
  source; `scores.engineering` and `extensions.dimensions.engineering` now
  come from it and feed `extensions.quality`.
- Added `packages/calibration`: pure `calibrate()` of an observed Result
  against a reference's `expected.json` (valid/solved/gates/dimensions/codes/
  score bounds), `buildCalibrationReport()` with mutation capture rate, and
  `compareRepeats()` which ignores ids/efficiency/evidence layout and flags
  any other difference.
- CLI: `pnpm eval calibrate <task> [--out]` runs gold, alternative and every
  `references/mutations/*` through the Docker pipeline; `pnpm eval repeat
  <task> --times N` runs one scenario repeatedly; generic
  `--mock-scenario reference:<name>` writes any reference tree (src/, tests/).
- react-orders-filter-017 now carries a structurally different alternative
  (useReducer, URL hook, components, `<ul>` list) and six mutations, each a
  1–3 line defect on gold with a declared expectation; gold and alternative
  each ship a unit test alongside the extracted filtering module.

### Verification

- Unit gates: v5-engineering 10/10, v5-calibration 3/3.
- Real Docker: calibration passed with mutationCaptureRate 1 (FR-014 /
  SC-003); repeat ×3 identical (SC-005).
- `node --test --test-concurrency=1 tests/gate/*.test.mjs`: 164 gates, 163
  green plus one stale V5.1 expectation (engineering now evaluated) fixed and
  rerun green. `pnpm build`, `pnpm check:generated` exit 0.

### Residual risks / next stage

- Visual scoring of the alternative is legitimately low (0.21) because its
  `<ul>` layout differs from gold baselines; the calibration expectation for
  correct alternatives therefore checks solved/gates, not visual. V6 owns
  seeds, success@k, comparison CLI and the 10-task dataset.

## 2026-09-10 → 2026-09-11 — V6 repeats, comparison, Suite publication and the 10-task MVP

### Scope and decisions

- `packages/comparison`: success@k / any@k / all@k over independent Runs
  (Attempts never count as samples; `allAtK` only over a full window of k;
  only `COMPLETED` Runs with a Result can be solved), raw infrastructure rate
  = Runs whose first Attempt hit an infrastructure error, final rate = Runs
  whose final classification is infrastructure_error, means over
  cost/wall/scores, and a stability extension (agreement of discrete
  conclusions). Emits the existing comparison-report schema.
- CLI: `eval batch` (one independent Run per seed), `eval compare`
  (rejects duplicate Run ids, repeated seeds, mixed task/environment
  fingerprints, Runs shared across configurations; ≥2 configurations by
  schema), `eval suite publish` (validates every task, requires gold +
  alternative + ≥1 mutation with parsed expectations, a hidden bundle, no
  credential patterns or symlinks, no hidden-assertion text in public files,
  a checksum-bound passing calibration report per task, unique ids and bundle
  checksums; version immutability in a `<suiteId>.published.json` ledger with
  atomic writes), `eval suite calibrate` (all-task matrix).
- Dataset: 10 calibrated tasks in the D8 distribution, each with README,
  starter, smoke test, hidden spec, gold + alternative (unit-tested), five
  single-defect mutations and expectations; `scripts/scaffold-task.mjs`
  shares one offline React runtime. Calibration reports are committed under
  `datasets/calibration/` and bound to bundle checksums; Suite
  `mvp-regression` v4 lists all 10.
- Adversarial review of V6 (9 findings) all accepted and fixed — see tdd-log.
  Two were dataset defects: the refactor task now asserts the singleton store
  is gone and the hook exists (references declare deletions in `.deleted`),
  and the async task now measures request frequency for its debounce
  requirement with a single-defect `no-debounce` mutation.

### Verification (2026-09-11, real Docker, Node 26)

- All 10 tasks recalibrated after the review fixes: mutationCaptureRate 1
  each; reports committed under `datasets/calibration/` and bound to bundle
  checksums; Suite `mvp-regression` v5 published through the calibration gate.
- 50-Run reliability baseline (`eval batch --seeds 1..5 --scenario
  reference:gold` per task) plus 50 starter (`react-orders-noop`) Runs, all
  100 COMPLETED with zero infrastructure errors; per-task gold-vs-noop
  comparison reports committed under `datasets/reliability/`: gold
  success@5 = 5/5 and all@5 on every task, noop 0/5, stability agreement 1
  for every configuration. One gold Run of react-search-debounce-043 had
  failed the new debounce test on the first baseline (timing jitter of
  host-side `fill` calls spread five keystrokes past the 150 ms window); the
  test now dispatches the keystrokes inside the page 10 ms apart, after which
  3 repeats were identical and the 5-seed batch was 5/5.
- Gates: V6.2-001 (publication contract), V6.3-003 (suite/calibration/
  checksum consistency + D8 distribution), V6.4-001 (reliability baseline).
- `node --test --test-concurrency=1 tests/gate/*.test.mjs`: 177/177,
  0 skipped. `pnpm build`, `pnpm check:generated` exit 0.

## 2026-09-11 — V7.1 first real Agent Adapter (OpenCode / Kimi K3)

### Scope and decisions

- Added `packages/adapter-opencode`: a workspace-mirror Adapter that speaks the
  existing stdio protocol. It reads the public workspace through routed
  `run_command`/`read_file` requests into a private host scratch, installs the
  bundle's proxy fixtures offline so the agent can self-verify, runs
  `opencode run --dir <scratch> -m <provider/model> --auto --pure --format json`,
  forwards OpenCode's JSON events as bounded `event` frames (steps, tokens,
  tool names with scratch paths relativized), then replays every changed or
  deleted file back through `write_file` / `run_command rm` so the Tool Router
  and the Docker workspace remain authoritative for the patch. Usage
  (tokens/cost/model) travels in `complete.extensions` and lands in
  `Result.efficiency` and `extensions.agent.model`.
- CLI: `run execute --agent opencode --model <provider/model> [--variant]`;
  `run create --budget-profile task|agent` (recorded immutably; the agent
  profile widens wall time/steps/cost, tool output and frame limits because
  Task budgets were sized for the scripted Mock).
- Tool policy: the whole public workspace is now readable (`ANY_PATH`);
  writes stay confined. Reads never reach the hidden bundle because it is
  not mounted at all.
- Known limitation (documented in the adapter header): the agent's own
  self-verification commands run on the host scratch, not in the sandbox.
  Evaluation always runs in the sandbox on the tool-routed patch.

### Verification

- Real model: `rundao/public/kimi-k3` on react-orders-filter-017, three
  iterations: (1) `readablePaths` = writable prefixes → the agent saw only 3
  files and refused; (2) mirroring `fixtures/*.tgz` inline blew the 1 MiB
  output budget → excluded binaries, offline install from host fixtures,
  agent-profile limits; (3) **solved=true**: functional 5/5, build 1,
  responsive 1, a11y 1, engineering 0.83 (no test added), visual 0.25
  (legitimately different layout from gold), 28.8k in / 8.1k out tokens,
  15 routed tool calls, 221 s.
- Gate V7.1-Docker drives the adapter with a fake `opencode` binary (via
  `OPENCODE_BINARY`) that writes gold `src/` → solved, usage recorded, patch
  contains both changed files, every tool call TOOL_SUCCEEDED, scratch path
  absent from events. V7.1-002 covers budget-profile recording.

### Kimi K3 sweep (seed 1, all 10 tasks) and two harness fixes

9/10 solved on the first pass. The one failure exposed a harness bug, not a
model bug: the Adapter host redacted **inbound frames before routing**, so a
`write_file` whose content contained `const password = values.password ?? ""`
reached the sandbox as `const [REDACTED:credential] ?? ""` and the Build gate
failed on a syntax error. Fixes: (1) tools now execute on the Adapter's raw
arguments — redaction is a persistence concern and the Tool Router already
redacts everything it records; (2) the credential heuristic's member-reference
exception also accepts `??`, `||`, `&&`, `? :`, `+`, `]`, `}` after the
reference. GATE-V2.2-006 still proves no secret reaches disk.

Re-run of react-form-validation-065 (seed 2): build passes; Kimi genuinely
fails `empty-submit-shows-all-errors` (its `confirm !== password` treats two
empty fields as matching, so only 3 of 4 errors render). Result 9/10 solved,
per-task 13–26k input / 1–4k output tokens, 60–135 s wall.

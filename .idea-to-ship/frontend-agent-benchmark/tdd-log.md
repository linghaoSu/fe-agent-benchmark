# TDD Log — frontend-agent-benchmark

## 2026-07-13 — V0 gate

- Test ID: `GATE-V0-001`
- Intent: validate `examples/task.yaml` through the documented public command
  `pnpm eval validate examples/task.yaml`.
- Test first: `tests/gate/v0-contract-validation.test.mjs` was added before any
  production implementation.
- Command: `node --test tests/gate/v0-contract-validation.test.mjs`
- Result: red, 1 failing / 0 passing.
- Failure: expected CLI exit code `0`, received `1` because the repository has
  no package manifest or `eval` command (`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`).
- Interpretation: intended missing V0 behavior; Node and pnpm are available,
  so this is not an environment or fixture-syntax failure.
- Production changes: none.
- Next: `$idea-to-ship:implement --slug frontend-agent-benchmark --stage V0`
  should make this single gate green before expanding coverage.

## 2026-07-17 — V0 implementation

- Existing red gate retained: `GATE-V0-001` remained unmodified.
- Added acceptance cases: `GATE-V0-002` unknown property,
  `GATE-V0-003` missing required field, and `GATE-V0-004` unsupported major
  schema version.
- Public seam: `pnpm eval validate <task-yaml>`.
- Commands:
  - `node --test tests/gate/v0-contract-validation.test.mjs`
  - `node --test tests/gate/v0-contract-errors.test.mjs`
- Result: green, 1/1 valid-fixture test and 3/3 invalid-fixture tests passing.
- Production change: minimal root/workspace manifests, `apps/cli`, and
  `packages/contracts` with YAML parsing, Draft 2020-12 structural validation,
  normalized errors, and a supported-major semantic check.

## 2026-07-17 — V0 gate green

- Implementation: Codex (sol, xhigh) created the pnpm workspace scaffold
  (`apps/cli` + `packages/contracts`), the `pnpm eval validate` command with
  Ajv Draft 2020-12 structural validation plus semantic `domain.code` errors,
  and tightened `schemas/task.schema.json` per architecture §8.1
  (`schemaVersion`, `additionalProperties: false`, explicit `extensions`
  namespace); `examples/task.yaml` gained `schemaVersion: 1`.
- Command: `node --test tests/gate/*.test.mjs`
- Result: green, 4 passing / 0 failing — `GATE-V0-001` plus three new
  `GATE-V0-002` invalid-fixture cases (unknown property, missing required
  field, unsupported schema major version).
- CLI evidence: `pnpm eval validate examples/task.yaml` exits 0 and emits
  `{"valid":true,"taskId":"react-orders-filter-017",...}`.
- Next: expand V0 coverage (result schema, checksum) or start V1
  (SQLite state store, immutable Run input).

## 2026-07-17 — V0.2 gate red → green

- Added `GATE-V0-005..008` in `tests/gate/v0-result-validation.test.mjs`
  for valid Result routing plus stable unknown-property, missing-required, and
  unsupported-major errors.
- Added `GATE-V0-009..010` in `tests/gate/v0-checksum.test.mjs` for directory
  and single-file determinism, sorted relative paths, no symlink following, and
  byte-change sensitivity.
- Red command: `node --test tests/gate/v0-result-validation.test.mjs tests/gate/v0-checksum.test.mjs`.
- Red result: 4 failed / 2 passed; checksum was an unsupported CLI command,
  valid Result was incorrectly validated as Task, and Result major-version
  handling was absent.
- Gate correction: the two coincidentally passing structural-error cases were
  strengthened to require `kind: "result"`.
- Focused red command: `node --test tests/gate/v0-result-validation.test.mjs`.
- Focused red result: 4 failed / 0 passed, all at the intended Result-routing
  seam before production changes.
- During diff review, `GATE-V0-009` was strengthened with a nested-versus-root
  path order case. It failed 1/2 because traversal order was not global relative
  path order, then passed 2/2 after sorting the completed file manifest.
- Green commands and results:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 10/10.
  - `pnpm check:generated`: passed, exit 0.
- Production result: Result and Task validation share schema selection and
  stable errors in `packages/contracts`; checksum uses sorted relative paths and
  per-file SHA-256 without following symlinks; generated Task/Result types are
  regenerated from canonical schemas and checked for drift.

## 2026-07-17 — V0.3 contract matrix red → green

- Added `tests/gate/v0-contract-matrix.test.mjs` and synthetic fixture matrices
  for all 18 canonical contract kinds before production changes.
- Public seam: the compiled `eval validate <path>` CLI used by `pnpm eval`.
- Red command: `node --test tests/gate/v0-contract-matrix.test.mjs`.
- Red result: 18 failed / 0 passed.
- Intended failures: the sixteen new kinds selected Task or Result validation;
  Task and Result also returned `schema.additional_property` before the required
  `schema.unsupported_major` error.
- Production changes: none before this red run.
- Green result: all 18 matrix cases passed after adding the canonical schemas,
  deterministic kind selection, and pre-structural unknown-major rejection.
- Full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 28/28.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V0.4 static preflight red → green

- Added `tests/gate/v0-preflight.test.mjs` and synthetic preflight bundles before
  production changes.
- Public seam: `pnpm eval preflight <task-dir>`; rejection output is limited to
  static `preflight` and `codes` fields before any Agent, Attempt, or sandbox.
- Red command: `node --test tests/gate/v0-preflight.test.mjs`.
- Red result: 0 passed / 6 failed; every case received the existing
  `cli.usage` response because `preflight` was not implemented.
- Production change: added pure npm/pnpm lock parsing, exact-version and
  integrity checks, snapshot package/version/integrity coverage, deterministic
  credential patterns, and the minimal CLI route in `packages/contracts` and
  `apps/cli`.
- Focused green command: `node --test tests/gate/v0-preflight.test.mjs`.
- Focused green result: 6 passed / 0 failed.
- Manual fixture checks: passing exited 0; invalid Task, missing lockfile,
  unpinned dependency, cache miss, and embedded fake credential each exited 1
  with the asserted stable code and file/pointer location.
- Full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 34/34.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V1.1 SQLite state-store red → green

- Added `tests/gate/v1-state-store.test.mjs` before V1 production code.
- Public seams: `openStateStore` and compiled `pnpm eval run create/show`.
- Red command: `node --test tests/gate/v1-state-store.test.mjs`.
- Red result: 0 passed / 6 failed.
- Intended failures: the state-store package did not exist and both Run CLI
  commands returned the existing stable `cli.usage` response.
- Production changes before red: none.

- Production change: added the schema-valid JSONL codec, coordinator session,
  subprocess host, deterministic Mock Adapter, append-only frame migration,
  `SubprocessAgentPhase`, events/patch/stderr Artifacts, CLI registration, and
  the missing-Run export guard.
- Focused green: `node --test tests/gate/v2-adapter-protocol.test.mjs` passed
  9/9.
- The first broad run passed 64/66. It found one stale migration expectation
  and one concurrent `pnpm eval` build/import race; neither test nor contract
  was weakened. Migration expectations now include version 5, and `pnpm eval`
  reuses fresh compiled output while retaining auto-build for stale/missing
  output.
- Exact final verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 66/66.
  - `pnpm check:generated`: passed, exit 0.
- Production change: added the `node:sqlite` state-store package, numbered
  checksum-bound migration, repositories, Run create/show/repair CLI flow, and
  atomic derived-input write.
- Focused green: `node --test tests/gate/v1-state-store.test.mjs` passed 6/6.
- Full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 40/40.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V1.2 Attempt lifecycle red → green

- Added `tests/gate/v1-run-lifecycle.test.mjs` before V1.2 production code.
- Public seams: compiled `RunExecutor` fault injection and `pnpm eval run execute/show`.
- Red command: `node --test tests/gate/v1-run-lifecycle.test.mjs`.
- Red result: 0 passed / 7 failed.
- Intended failures: `run execute` returned `cli.usage`; the run-coordinator
  package and its lifecycle/fault APIs did not exist.
- Production changes before red: none.
- Production change: added forward migration 2, durable Attempt transitions and
  producer records, the typed no-op/fault phase coordinator, and CLI execute/show
  lifecycle views.
- Focused green: `node --test tests/gate/v1-run-lifecycle.test.mjs` passed 7/7.
- Full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 47/47.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V1.3 execution lease, Artifact commit, and reconciliation gate (red)

- Added `tests/gate/v1-lease-artifacts.test.mjs` before V1.3 production changes.
- Public seams: state-store leases, `RunExecutor`, `ArtifactStoreFs`, and
  compiled `eval run execute/show/doctor` commands.
- Focused red command: `node --test tests/gate/v1-lease-artifacts.test.mjs`.
- Red result: 0 passed / 7 failed.
- Intended failures: lease APIs and migration 3 were absent; no Artifact store,
  manifest, canonical Result, derived `result.json`, or doctor command existed.
- Production changes before red: none.
- Production change: added checksum-bound migration 3, PID-incarnation guarded
  execution/migration leases, `packages/artifact-store-fs`, no-op Artifact
  staging/finalization, canonical SQLite Result plus atomic derived
  `result.json`, and structured doctor reconciliation.
- Focused green: `node --test tests/gate/v1-lease-artifacts.test.mjs`
  passed 7/7.
- Exact full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 54/54.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V1.4 requester-safe export red → green

- Added `tests/gate/v1-export.test.mjs` before V1.4 production changes.
- Public seam: `pnpm eval run export --audience requester <run-id>` plus the
  existing schema validator, Run view, export tree, and SQLite audit records.
- Focused red command: `node --test tests/gate/v1-export.test.mjs`.
- Red result: 0 passed / 3 failed.
- Intended failure: all three cases reached the existing `cli.usage` response
  because `run export`, migration 4, and the export-policy package did not exist.
- Production changes before red: none.
- Production change: added migration 4 and append-only export audits,
  `packages/export-policy` with allowlisted reconstruction, versioned public
  taxonomy, reference/credential scans, schema validation and staged atomic
  publication, plus the `run export` CLI route.
- Focused green: `node --test tests/gate/v1-export.test.mjs` passed 3/3.
- Exact full verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 57/57.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V2.1 adapter protocol runtime gate (red)

- Added `tests/gate/v2-adapter-protocol.test.mjs` and seven subprocess fault
  fixtures before V2 production changes.
- Public seams: `eval run execute --agent mock`, `SubprocessAgentPhase`, the
  adapter-frame repository, finalized Artifacts, and missing-Run export denial.
- Red command: `node --test tests/gate/v2-adapter-protocol.test.mjs`.
- Red result: 0 passed / 9 failed. The happy path reached `cli.usage`, fault
  paths found no recorded Adapter protocol limits, and missing-Run export
  surfaced `RUN_COMMAND_FAILED`; these are the intended absent V2.1/V1 cleanup
  behaviors at public seams.
- Production changes before red: none.

## 2026-07-17 — V2.2 Tool Router red → green

- Added `tests/gate/v2-tool-router.test.mjs` before V2.2 production changes.
- Public seams: compiled `ToolExecutor`, scripted Mock Adapter subprocess,
  coordinator lifecycle, SQLite Tool Call rows, finalized Artifacts, Adapter
  frames/environment, and canonical Result efficiency.
- Initial red command: `node --test tests/gate/v2-tool-router.test.mjs`.
- Initial red result: 0 passed / 1 failed because
  `packages/tool-router/dist/index.js` did not exist; Node and the test runner
  executed normally, so this was the intended missing public seam.
- Green coverage: all four fake tools; disallowed tool and parent/absolute/
  forbidden-prefix paths; proxy/DNS/network override denial; exact Tool Call,
  output, and wall-time budget codes/lifecycle; cooperative heartbeat wall
  deadline; private truncation Artifact; credential/stderr byte-scan
  redaction; Adapter env allowlist; and accepted-before-execution persistence.
- Focused green: `node --test tests/gate/v2-tool-router.test.mjs` passed 9/9;
  V2.1 plus V2.2 passed 18/18.
- Exact final verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: passed, 75/75.
  - `pnpm check:generated`: passed, exit 0.

## 2026-07-17 — V3.1 real Docker workspace sandbox gate red → green

- Added `tests/gate/v3-sandbox-unit.test.mjs` and
  `tests/gate/v3-sandbox-docker.test.mjs` before V3.1 production changes.
- Public seams: fake-client `DockerSandboxRuntime`, writable-prefix Task
  preflight, and real `eval run create/execute/show --sandbox docker`.
- Red command: `node --test tests/gate/v3-sandbox-unit.test.mjs`.
- Red result: 0 passed / 4 failed.
- Intended failure: `packages/sandbox-docker/dist/index.js` did not exist; the
  Node test runner and existing compiled contracts loaded normally.
- Production changes before red: none.
- Production change: added the Docker CLI-backed `SandboxRuntime`/workspace
  runner, pinned-image/daemon preflight, per-Attempt locked-down container and
  explicit writable/protected mounts, container-exec file/shell tools,
  deterministic patch capture, idempotent cleanup, Run lifecycle integration,
  immutable CLI runner/image inputs, and writable-prefix Task preflight.
- Focused green: `node --test tests/gate/v3-sandbox-unit.test.mjs
  tests/gate/v3-sandbox-docker.test.mjs` passed 4/4 unit gates and skipped the
  real-Docker gate with `DOCKER_UNAVAILABLE` because the managed shell was not
  permitted to open the OrbStack daemon socket.
- Exact final verification:
  - `pnpm install`: passed, exit 0.
  - `pnpm -r build`: passed, exit 0.
  - `node --test tests/gate/*.test.mjs`: 79 passed / 0 failed / 1 skipped;
    the skip message names `DOCKER_UNAVAILABLE` and the denied OrbStack socket.
  - `pnpm check:generated`: passed, exit 0.

## 2026-09-09 — V3.2 Attempt network lifecycle red → green

- Red: the V3.1 fake Docker client had no network lifecycle and declared
  services still used `--network none`.
- Green: `GATE-V3.2-001` proves internal per-Attempt network creation, service
  ordering, Agent attachment, persisted identity seam, and removal-plus-label
  absence proof during cleanup. `v3-network.test.mjs` adds the real-Docker
  alias and deny-probe gate.
- Focused green: `node --test tests/gate/v3-sandbox-unit.test.mjs
  tests/gate/v3-network.test.mjs` passed 5/5 and skipped the Docker gate as
  `DOCKER_UNAVAILABLE` because this shell cannot access OrbStack.
- Follow-up verification (2026-09-09, Claude): real-Docker `GATE-V3.2-Docker`
  initially failed with `SANDBOX_START_FAILED` because
  `containerNetworkIp` indexed `.NetworkSettings.Networks` by network ID while
  Docker keys that map by network name; switched to a `range` + `NetworkID`
  match and the gate passed (mock-api alias reachable; external IP, host
  gateway and public DNS probes all denied). Migration-list assertions in
  `v1-state-store` / `v1-export` bumped to include migration 7.
- Flake mitigation: `DEFAULT_HEARTBEAT_TIMEOUT_MS` raised 1000 → 5000 and the
  passing preflight fixture wall budget raised 1 → 10s (wall-budget gates set
  their own `maxWallTimeMs`). Under sustained host load averages above ~100 the
  mock adapter still needs >10s to emit its first frame (I/O-bound module load,
  0.3s CPU), so V2.1/V2.2/V3.1-Docker gates remain load-sensitive; a quiet-host
  full run is still required before declaring V3.2 network half complete.
- Not yet implemented in this slice: fixture tarball package proxy install and
  the stopped-proxy `DEPENDENCY_PROXY_UNAVAILABLE` preflight/retry path.

## 2026-09-09 — V3.2 controlled package proxy red → green

- Red: `tests/gate/v3-proxy.test.mjs` initially found no fixture mount or fixed
  registry environment on the Agent container.
- Green: the fake-Docker gate now proves fixture mount, proxy start/probe before
  Agent start, fixed npm registry environment, teardown order, schema-valid
  trusted diagnostic, finalized maintainer-only Artifact, and the two-Attempt
  `DEPENDENCY_PROXY_UNAVAILABLE` retry path visible through `run show`.
- The real-Docker `npm ci` fixture gate is present but skipped as
  `DOCKER_UNAVAILABLE`: this managed shell cannot access OrbStack's Docker
  socket. The existing V3 network gate skips for the same reason.
- Follow-up verification (2026-09-09, Claude, Docker reachable): the
  fixture tarball `tests/fixtures/package-proxy/tarballs/*.tgz` had not been
  packed — generated with `npm pack`. Real-Docker `npm ci` gate then failed
  twice: (1) proxy health probe required `r.ok` on `/` which the static server
  404s, and ran before the server was listening — probe now accepts any HTTP
  response and polls up to 10s; (2) npm could not create `/home/node/.npm` on
  the read-only rootfs — `registryEnvironment` now pins `npm_config_cache` and
  `HOME` to the `/tmp` tmpfs and disables audit/fund/update-notifier.
- Final verification on a loaded host (load avg ~100):
  `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 87 passed /
  0 failed / 0 skipped, including GATE-V3.1-Docker, GATE-V3.2-Docker (network
  and npm ci) ; `pnpm -r build` and `pnpm check:generated` exit 0.

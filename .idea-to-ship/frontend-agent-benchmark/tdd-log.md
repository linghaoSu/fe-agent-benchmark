# TDD Log — frontend-agent-benchmark

## 2026-09-10 — V4.2a start and hidden functional evaluator red → green

- Red: V4.1 had no post-build application lifecycle or functional gate; its
  aggregation could only report `not_evaluated`.
- Green: `GATE-V4.2a-001..004` cover bounded start timeout/skipping, sanitized
  functional scoring, hidden-bundle mount exclusion, and passed/failed/skipped
  aggregation. Docker acceptance cases cover `build-pass` and `functional-break`.
- This host cannot access OrbStack, so Docker cases skipped as `DOCKER_UNAVAILABLE`.

## 2026-09-09 — V4.1 evaluator coverage red → green

- Red: `GATE-V4.1-006` showed a schema-valid evaluator result could cite a
  nonexistent evidence artifact and still finalize a completed Result.
- Green: coordinator rejects it as `EVALUATOR_EVIDENCE_REF_DANGLING`; unit
  gates cover integrity/build aggregation, evaluator errors, digest mismatch,
  Result schema validation, and evidence closure.
- Added Docker CLI gates for `build-pass`, `build-break`, and
  `forbidden-write`; this host skips them cleanly as `DOCKER_UNAVAILABLE`.

## 2026-09-09 — V3.3 phase barrier red → green

- Red: no immutable post-Agent workspace collector existed.
- Green: `v3-barrier.test.mjs` proves deterministic digests, exclusions,
  read-only snapshots, and unsafe-entry rejection.

## 2026-09-09 — V3.3 deferred verification red → green

- Red: cleanup failure did not qualify for the documented single infrastructure
  retry; the new `GATE-V3.3-005b` observed a terminal failed Run.
- Green: the coordinator retries `SANDBOX_CLEANUP_FAILED` once; residual
  processes remain terminal `invalid` and never retry.
- Added fake-client gates for census ordering, clean-census no-kill, immutable
  manifest exclusions, and a frozen ToolExecutor denial (`TOOL_ROUTER_CLOSED`)
  without invoking its runner.
- Added real-Docker residual-process and unsafe-entry gates. This environment
  skipped them cleanly as `DOCKER_UNAVAILABLE` because OrbStack's socket denied
  access.

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
- Follow-up verification (2026-09-09, Claude, Docker reachable): real-Docker
  V3.1 gate failed twice after the V3.3 core landed. (1) The census matcher
  compared against `ps -eo pid=,args=` but busybox re-renders its own argv as
  `ps -eo pid= args=`, so the census process itself counted as residual and
  every Attempt became `SANDBOX_RESIDUAL_PROCESSES`; matcher loosened. (2) The
  snapshot was written straight to `<run>/attempts/<n>/snapshot`, so the
  manifest-last rename found the final directory already present
  (`ARTIFACT_FINAL_PATH_EXISTS`); the snapshot now lives inside the Attempt
  staging directory via `ArtifactStoreFs.attemptStagingDirectory` and publishes
  atomically with the manifest. Gate temp cleanup now restores write bits
  before `rmSync` (`tests/gate/_cleanup.mjs`) because snapshots are `a-w`.
  Migration-list assertions include 8.
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 91/91,
  0 skipped, incl. all real-Docker gates; build and check:generated exit 0.
- Follow-up verification (2026-09-09, Claude, Docker reachable): the real-Docker
  residual-process gate failed because the census kill step ran `kill` as
  `0:0`; with `--cap-drop ALL` root lacks CAP_KILL over UID-1000 processes, so
  the stray `sleep 300` survived and every such Attempt became
  `SANDBOX_RESIDUAL_PROCESSES`. The kill now runs as the sandbox user
  (`1000:1000`), which owns the processes. Verified in a live container.
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 98/98,
  0 skipped, incl. both new real-Docker V3.3 scenarios; build and
  check:generated exit 0. V3 stage complete.
## 2026-09-09 — V4.1 evaluator core red → green

- Red: `node --test --test-concurrency=1 tests/gate/v4-evaluators.test.mjs`
  failed because the V4 evaluator gate and evaluator packages did not exist.
- Green: the new focused gate proves deterministic integrity classifications,
  ordered prerequisite skip behavior, invalid plugin output conversion to
  `EVALUATOR_RESULT_INVALID`, and first-failing build command behavior.
- Focused verification: `pnpm -r build`, `node --test --test-concurrency=1
  tests/gate/v4-evaluators.test.mjs`, and `pnpm check:generated` passed.
- Follow-up (2026-09-09, Claude): the three new evaluator packages inherited
  `noEmit: true` from the root tsconfig so `dist/` was never produced and all
  V4.1 gates failed with ERR_MODULE_NOT_FOUND; tsconfigs now mirror the other
  packages. `integrityCode` treats a bare `**` writable pattern as
  match-everything so the dependency-change rule is reachable; the gate's
  expectations were corrected accordingly (`.env` outside `src/**` →
  OUTSIDE_WRITABLE; `package.json` under `**` with dependency changes
  disallowed → DEPENDENCY_CHANGE). Focused V4.1 gate 3/3.
- 2026-09-09 V4.1b red → green: coordinator evaluation remained hard-wired to
  `NoopEvaluator`; the pipeline now stages each evaluator result and derives
  validity/build score from integrity/build outcomes. Focused evaluator gate:
  3/3 green; root build and generated-schema check green. Docker acceptance is
  blocked in this managed shell by an inaccessible OrbStack socket.
- Follow-up verification (2026-09-09, Claude, Docker reachable): the V4.1b
  wiring failed end-to-end five separate ways before the first real evaluated
  Run: (1) the host copy of the `a-w` snapshot into the evaluation workspace was
  itself read-only → EACCES on install (working copy is now chmod'd writable);
  (2) `assertSnapshot` re-collected the snapshot into a temp dir and hit EACCES
  on the copy — added `digestFrozenSnapshot` (walk + digest, no copy);
  (3) `fixtureDirectory` was dropped from the packageProxy Task metadata so the
  evaluation proxy container had no `/fixtures` mount → npm 404; (4) evaluation
  command timeout was the 30s Agent wall budget → `spawnSync docker ETIMEDOUT`
  on npm ci; now an independent 5-minute evaluation command timeout; (5) the
  node-min lockfile/snapshot integrity hashes were typed by hand and did not
  match the real tarball → npm "corrupted" — recomputed. Regressions fixed:
  NoopEvaluator now echoes `context.snapshotDigest` (was a `noop:` literal that
  tripped the new digest check → EVALUATOR_RESULT_INVALID on retry Attempts);
  evaluator artifact names derive from `evaluatorId`, so noop id is `noop`;
  an Attempt with no patch stages no patch.diff, so the CLI passes an empty
  patch to Integrity instead of throwing ENOENT.
- Real-Docker end-to-end on tests/fixtures/projects/node-min: `build-pass` →
  valid=true solved=true scores.build=1 with install/typecheck/lint/test/build
  logs; `build-break` → valid=true solved=false BUILD_TEST_FAILED;
  `forbidden-write` → valid=false INTEGRITY_FORBIDDEN_PATH, build skipped.
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 101/101,
  0 skipped; build and check:generated exit 0.
- Follow-up verification (2026-09-10, Claude, Docker reachable): real-Docker
  V4.1 gates surfaced two production defects. (1) The pipeline staged a
  skipped/passed evaluator result before appending its own artifact path to
  `evidenceRefs`, so the on-disk `evaluator-results/build.json` for a skipped
  Build failed the schema's non-empty `evidenceRefs` rule; the document now
  carries its self-reference before staging. (2) Integrity always cited
  `patch.diff` as evidence, but an Attempt with no workspace change stages no
  patch, tripping the new `EVALUATOR_EVIDENCE_REF_DANGLING` closure check; the
  ref is cited only when a patch exists. Test-side: requester export lands at
  `exports/requester/`, not `exports/<exportId>/`. A full-suite red streak of
  every Docker gate reporting `SANDBOX_IMAGE_UNAVAILABLE` was a genuinely
  pruned local image (re-pulled by digest) — the preflight code worked as
  designed.
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 107/107,
  0 skipped, incl. 3 real-Docker V4.1 scenarios with requester export; build
  and check:generated exit 0. V4.1 complete.
- Follow-up verification (2026-09-10, Claude, Docker reachable; work now on
  `main`): the real browser path failed four ways. (1) The Playwright plugin
  staged its per-test report at `evaluator-results/functional.json`, the path
  reserved for the evaluator result document → EEXIST; moved to
  `functional/tests.json`. (2) The official `mcr.microsoft.com/playwright`
  image ships browsers under `/ms-playwright` but no library, so
  `require('@playwright/test')` failed silently and every functional run
  scored 0; `playwright-core@1.59.1` (the version matching the image) is now
  vendored host-only under `tests/fixtures/playwright-runtime/` and
  bind-mounted read-only at `/opt/playwright-runtime` with `NODE_PATH`; the
  runner requires `playwright-core`; `/dev/shm` tmpfs added for Chromium.
  (3) Requester export of an evaluated Run was denied
  `EXPORT_REFERENCE_CLOSURE_FAILED` because the host-path heuristic matched
  URL paths like `/api/health` inside the Agent's own patch/events; the
  heuristic now matches only well-known host roots. (4) The new `solved` rule
  treated a missing functional evaluator as a failed required gate, breaking
  the no-op Run export (`UNSOLVED`); `not_evaluated` is now distinct from
  `skipped`. Also: Codex had made the Agent network unconditional; Agent
  containers are back on `--network none` unless services or `appNetwork`
  (app port declared) require the internal network, and the `app` alias is
  applied only in that case.
- Real-Docker end-to-end on node-min: `build-pass` → START_PASSED,
  FUNCTIONAL_PASSED, solved=true, scores.functional=1;
  `functional-break` → FUNCTIONAL_CRITICAL_FAILED, solved=false,
  scores.functional=0.5, scores.build=1.
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 112/112,
  0 skipped; build and check:generated exit 0. V4.2a complete.

- 2026-09-10 V4.2b red → green: `v4-react-orders.test.mjs` first failed with
  a missing task bundle, then passed static validation/checksum/proxy-integrity
  coverage after the bundle and mock scenarios were added. The real-Docker
  cases skip cleanly here because OrbStack's socket is inaccessible.
- Follow-up verification (2026-09-10, Claude, Docker reachable): the gold
  react-orders run reached Build passed but then failed three ways. (1) The
  app readiness probe hardcoded `/api/health` (a node-min detail) so a plain
  static server never became ready → START_TIMEOUT; the probe now accepts any
  non-5xx response on `/`. (2) The hidden spec's `rows` helper was declared
  `async`, so `rows(page).count()` was called on a Promise and every critical
  test threw (0/3), and multi-row `locator.textContent()` would have violated
  strict mode — fixed to a sync locator plus `allTextContents()`. Verified the
  gold app itself rendered correctly in the browser before touching the spec.
  (3) With every test failing, unbounded `waitForFunction` waits (30s default
  × 5) exceeded the browser exec timeout and the noop gate timed out; the
  runner now sets 5s action / 15s navigation defaults.
- Real-Docker end-to-end on datasets/tasks/react-orders-filter-017:
  `react-orders-gold` → INTEGRITY_PASSED, BUILD_PASSED (npm ci offline through
  the proxy, 3 packages), START_PASSED, FUNCTIONAL_PASSED 5/5 → valid=true
  solved=true scores.build=1 scores.functional=1, requester export succeeds;
  `react-orders-noop` → FUNCTIONAL_CRITICAL_FAILED → solved=false,
  scores.functional=0. This is the first complete evaluated Run of the
  benchmark's reference task (the CODEX_TASK.md acceptance flow).
- Final: `node --test --test-concurrency=1 tests/gate/*.test.mjs` → 116/116,
  0 skipped; build, check:generated, task validate/checksum exit 0. V4 stage
  complete.

## 2026-09-10 — V5.1 Visual / Responsive / Accessibility evaluators red → green

- Workflow change: implementation by three parallel in-session sub agents
  (one package each: evaluator-visual, evaluator-responsive, evaluator-a11y)
  with unit gates written first (`v5-visual` 9, `v5-responsive` 9, `v5-a11y`
  8 — 26/26); Claude wired the shared plumbing (task metadata viewports /
  locale / timezone / weights / `evaluation.visual.mismatchThreshold`, run
  input, `PipelineEvaluationPhase` plugin list, aggregation, `eval baseline`
  CLI) and verified on real Docker + Chromium.
- Red on real Docker: the react-orders-filter-017 bundle declared no
  `viewports`, so every quality dimension came back `not_evaluated`; the gold
  reference's search input and status select had no accessible names
  (axe `select-name` critical + builtin `form-labels`) → A11Y_VIOLATIONS 0.88;
  no baselines existed → VISUAL_BASELINE_MISSING.
- Green: viewports + weights (0.5/0.2/0.1/0.1/0.1) added to the task; gold and
  starter controls carry `aria-label`; `pnpm eval baseline
  datasets/tasks/react-orders-filter-017` generated 3 PNG baselines from the
  gold run (desktop 1440×900, tablet 768×1024, mobile 375×812). Gold →
  VISUAL_PASSED 0.94, RESPONSIVE_PASSED 1, A11Y_PASSED 1, quality 0.9867,
  solved=true. New `react-orders-mutation-overflow` scenario (table
  `min-width: 2000px`) → RESPONSIVE_OVERFLOW 0.33 and visual mismatch while
  functional stays passed and `solved` is unchanged — quality dimensions never
  offset the functional gate.
- Baseline command initially failed to remove its throwaway root because the
  frozen snapshot is `a-w`; it now restores write bits before `rmSync`.
- `tests/gate/v5-quality.test.mjs`: baseline PNG shape, hidden baselines absent
  from every Agent mount, and the two real-Docker scenarios — 4/4.
- Adversarial review (Codex gpt-5.6-sol, `review-mtv7fdmk-izysop`) on a3e1903
  returned 6 findings; triage: fix 1–5, minimal mitigation for 6.
  (1) PNG decoder now rejects > 12 M pixels before inflating and bounds
  `inflateSync` output; capture clips pages taller than 8000 px and enforces a
  10 MiB total transport budget so three viewports fit the exec buffer.
  (2) Responsive measurement intrinsics (`querySelectorAll`,
  `getBoundingClientRect`, `getComputedStyle`, `scrollWidth`/`innerWidth`
  getters) are captured in an init script before any page code runs and bound
  to a non-writable, randomly named function — page scripts cannot redefine
  what the evaluator calls. (3) When axe is configured and does not run
  (strict CSP, tampered `window.axe`) the result is `A11Y_MEASUREMENT_FAILED`,
  never a builtin-only pass. (4) `EvaluatorPlugin.metadata().informational`;
  the pipeline downgrades informational crashes to `failed` /
  `<ID>_MEASUREMENT_FAILED` (SNAPSHOT_DIGEST_CHANGED stays terminal), so
  quality evaluators can never turn a Run into `evaluator_error`.
  (5) `eval baseline` reads the final succeeded Attempt and writes all
  viewports or none. (6) Screenshot contexts pin `Date`/`Date.now` and
  `Math.random` via init script; full determinism policy deferred to the V5.2
  repeat comparator. Regenerated baselines are byte-identical across two
  consecutive runs.
- New gates: V4.1-002b (informational downgrade), V5-A11Y-009 (axe blocked),
  V5-VISUAL-010 (pixel budget). All V5 unit + real-Docker quality gates green.

## 2026-09-10 — V5.2 Engineering evaluator, calibration report, repeat comparator red → green

- Sub agents: `packages/evaluator-engineering` (6 deterministic patch checks,
  10 unit gates) and the react-orders `references/alternative` (useReducer +
  hooks/components, `<ul>` list) plus six `references/mutations/*` with
  `expected.json`. Claude: `packages/calibration` (`calibrate`,
  `buildCalibrationReport`, `compareRepeats`), `pnpm eval calibrate` and
  `pnpm eval repeat`, generic `--mock-scenario reference:<name>`, pipeline and
  aggregation wiring for `scores.engineering`.
- Red 1: Result became schema-invalid (`evidenceRefs` uniqueItems) once
  Integrity and Engineering both cited `patch.diff`; aggregation dedupes.
  Validation errors are now included in RESULT_INVALID messages.
- Red 2: gold and alternative scored engineering 0.83 — `tests-touched-with-
  source` fired because neither reference shipped a test. That is a real
  quality gap in the references, not the rule: gold gained `src/filters.js`
  + `tests/filters.test.mjs`, alternative gained `src/selectors.js` +
  `tests/select-visible.test.mjs`; the reference scenario now writes every
  writable tree under a reference (src/ and tests/).
- Red 3: mutations had been copied from the pre-refactor gold; regenerated
  each as exactly one defect on the current gold (1–3 changed lines each).
- Red 4 (transient): one gold run scored functional 0.8 on a host at load
  ~60 while 3 consecutive repeats were identical; hidden-test defaults raised
  to 15s action / 30s navigation.
- Green: `pnpm eval calibrate datasets/tasks/react-orders-filter-017` →
  passed=true, mutationCaptureRate=1 (8/8 entries): gold and alternative
  solved with engineering 1; drop-search-handler / wrong-status-param /
  stale-request-overwrite → solved=false; remove-empty-state → functional
  0.8 with critical gate passed; remove-aria → accessibility 0.88 failed;
  force-overflow → responsive 0.33 + visual failed. `pnpm eval repeat --times
  3` on gold → identical conclusions across 21 compared fields.
- Adversarial review (Codex gpt-5.6-sol, `review-mtvcp71n-d61uwv`) on 34770cf:
  7 findings, all accepted as in scope. (1 critical) reference walker now
  refuses symlinks/special files at every level (no-follow); (2) calibration
  rejects a reference Run whose final Attempt did not complete the Agent phase
  normally or whose tool calls were not all TOOL_SUCCEEDED — the sample would
  otherwise be the starter or a partial tree; (3) `compareRepeats` now takes
  `{ result, fingerprint, codes }` and compares input hash, image digest,
  dependency snapshot, network policy and ordered producer codes; (4)
  `expected.json` is mandatory for every reference and runtime-validated
  (unknown keys, wrong types, empty expect all fail) — gold and alternative
  gained explicit expectations incl. `scoreAtLeast`; (5) a report needs gold +
  alternative + ≥1 mutation to pass and zero mutations is 0% capture;
  (6) `git diff --binary` binary and rename records without ---/+++ headers are
  registered from the `diff --git` header; (7) recursive `eval run` children
  carry a 20-minute timeout. New gates V5.2-004/005/006 and V5-ENG-011.
- Final after review fixes: 168 gates, 165 green on the first pass; the three
  failures were the V2.2 heartbeat cluster under load (avg 47) and passed 9/9
  on an isolated rerun. Calibration and repeat Docker gates green.

## 2026-09-10 — V6.1 seed batches, success@k and comparison report red → green

- `packages/comparison`: `summarizeConfiguration` (success@k / any@k / all@k
  over the first k Runs — k counts Runs, never Attempts; raw vs final
  infrastructure rate; mean cost/wall/scores), `stabilityOf` (agreement of
  discrete conclusions), `buildComparisonReport` emitting the existing
  comparison-report schema with stability and seeds in `extensions`.
- CLI: `pnpm eval batch <task> --seeds 1,2,3 [--scenario] [--configuration]`
  creates one independent Run per seed in the same database; `pnpm eval
  compare --config <id>=<runIds> … [--k] [--out]` builds and validates the
  report from stored Runs.
- Red: `compare` dispatch required no positional, but the CLI parser treats
  the first argument as `inputPath`, so `--config` fell into usage. Fixed by
  passing it through.
- Green: unit gates V6.1-001/002; real Docker: batch 2×gold + 2×noop then
  compare → gold success@2 = 2 (all@k), noop 0 (any@k false), functional
  means 1 vs < 1, gold stability agreement 1.
- V6.2 Suite publication: `pnpm eval suite publish --id --version --type
  --task … --out` validates every task, requires gold + alternative + ≥1
  mutation with expectations and a hidden bundle, scans public and hidden text
  for credential patterns and symlinks, rejects duplicate ids and bundle-
  checksum overlap, refuses to rewrite a published version with a different
  manifest, and emits a schema-valid Suite. `datasets/suites/mvp-regression.json`
  published with react-orders-filter-017. Gate V6.2-001 covers accept /
  duplicate / incomplete / republish.

## 2026-09-10 — V6.3 dataset expansion (4 of 10 tasks), suite calibration matrix

- `scripts/scaffold-task.mjs` clones the shared offline runtime (server,
  scripts, lockfile, proxy fixtures, task.yaml skeleton) so every task shares
  one pinned environment. Three sub agents authored, in parallel and from one
  self-contained brief each: `react-cart-quantity-021` (feature: integer-cent
  cart totals with a float-trap mutation), `react-todo-toggle-bug-032`
  (bugfix: index-vs-id toggle, inverted count, stale completed attribute),
  `react-search-debounce-043` (async: debounce + stale-response guard against
  a fake API whose shorter queries resolve slower). Each ships README, starter,
  smoke test, hidden spec (≥3 critical), gold + alternative with unit tests
  and expectations, 5 one-defect mutations with expectations.
- Real Docker: `eval baseline` then `eval calibrate` for each — 021, 032 and
  043 all passed on the first run with mutationCaptureRate 1 (7/7 entries
  each); no fixes were needed. `eval suite publish` v2 now lists 4 tasks;
  `eval suite calibrate` (all-task matrix) added. Gates V6.3-001/002 check
  every dataset bundle is complete, validated, ≥5 mutations, unique checksum.
- V6.3 (continued): tasks 054 (accessibility: WAI-ARIA tabs), 065 (feature:
  form validation), 076 (bugfix: pagination) authored by sub agents and
  calibrated on real Docker. 054 and 076 passed 7/7 first time. 065 exposed
  two evaluator defects, both fixed with gates: (1) static preflight rejected
  the gold `validate.js` as a credential because the generic pattern matched
  `errors.password = MESSAGES.password` — the pattern now requires a quoted
  literal value; (2) the responsive `no-zero-size-visible-testids` check
  flagged an empty `form-status` live region (360×0) — empty elements are now
  legitimately zero-size (V5-RESP-010). 065 then passed 7/7 with 100% capture.
- V6.3 complete — 10 calibrated tasks in the D8 distribution (3 feature: 017,
  021, 065; 3 bugfix: 032, 076, 087; visual 098; async 043; accessibility 054;
  refactor 109). Last three exposed two more defects, fixed with gates:
  (1) responsive visibility was per-element (`display`/`visibility` of the
  node itself), so the 7 links inside a collapsed `hidden` nav list counted
  as visible zero-size elements — measurement now uses the captured
  `Element.prototype.checkVisibility` (ancestor-aware); (2) gold for the
  refactor task changed 27 source lines with no test change — a legitimate
  engineering finding, resolved by moving the "no empty notes" rule into the
  pure reducer with a unit test (and regenerating the mutations from it).
  All 10 tasks: mutationCaptureRate 1. `datasets/suites/mvp-regression.json`
  v3 lists all 10 with unique bundle checksums.
- The tightened credential pattern broke GATE-V2.2-006 (unquoted
  `api_key=adapterstderrsecret123456` must still be redacted); the pattern now
  accepts a quoted value OR a bare 12+ char value containing a digit, which
  keeps redaction and still ignores code identifiers. Full suite 175 gates,
  174 first-pass + this fix rerun green.

## 2026-09-10 (night) — V6 adversarial review triage (in progress)

- Codex review `review-mtvl5lmv-19r36n` on 23fd855: 9 findings, all accepted
  (real, in scope, small). Applied so far, pending Docker verification:
  (1) credential heuristic excludes only dotted member references and calls
  (`MESSAGES.password`, `validatePassword(...)`) — bare alphabetic secrets are
  flagged again; (2) `suite publish` requires `--calibration <dir>` holding a
  passing report whose `bundleChecksum` matches each task, parses every
  expected.json, and (3) rejects any public file containing a distinctive
  line of the hidden spec; (4) version immutability lives in a
  `<suiteId>.published.json` ledger independent of `--out`, writes are atomic,
  `publishedAt` is stable on identical republish; (5) `compare` rejects
  duplicate Run ids, repeated seeds, mixed task/environment fingerprints,
  duplicate configuration ids and Runs shared across configurations;
  (6) success requires `status === COMPLETED`, `allAtK` requires a full window
  of k; (7) task 109 gained a critical structural hidden test (`/src/store.js`
  must 404, `useDashboard.js` must exist and use `useReducer`) and references
  declare `src/store.js` in a `.deleted` manifest that the mock adapter
  applies via `run_command rm`; (8) task 043's fixed API counts calls on
  `globalThis.__searchUsersCalls`, a critical `debounce-limits-requests` test
  requires ≤ 2 calls for 5 fast keystrokes, and the two-defect mutation was
  replaced by single-defect `no-debounce`; (9) raw infrastructure rate is
  first-Attempt infrastructure failures per Run.
- 50-Run reliability baseline: 45/50 gold Runs completed (all 9 other tasks
  5/5) before the OrbStack Docker daemon stopped answering
  (`spawnSync docker ETIMEDOUT` → correctly classified DOCKER_UNAVAILABLE); the
  daemon is still hung, so the baseline, recalibration of 043/109, suite v4
  republish and the full gate run are pending a Docker restart.
- 2026-09-11 (Docker recovered): all nine review fixes verified. 043 and 109
  recalibrated 7/7; all 10 reports regenerated and committed; suite v5
  published through `--calibration`; 100-Run baseline gold 50/50 solved,
  noop 0/50, stability 1; the debounce test was made jitter-proof after one
  gold miss (keystrokes dispatched in-page). Full suite 177/177.

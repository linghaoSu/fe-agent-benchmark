# Gate Test Plan — frontend-agent-benchmark

> Mode: `gate`  
> Stage: V0 — Contracts and deterministic fixtures  
> Status: green; original red evidence retained  
> Date: 2026-07-13

## Selected vertical slice

`GATE-V0-001` validates the published Task fixture through the V0 public CLI
seam:

```bash
pnpm eval validate examples/task.yaml
```

The expected value comes from the approved architecture V0 observable behavior:
the command succeeds and emits structured output for the valid fixture. It also
supports FR-001's requirement that Task validation occurs before Agent launch.

| Test ID | Public seam | Test file | Expected behavior |
|---|---|---|---|
| `GATE-V0-001` | `pnpm eval validate examples/task.yaml` | `tests/gate/v0-contract-validation.test.mjs` | Exit code 0 and parseable structured JSON for `examples/task.yaml` |
| `GATE-V0-002` | `pnpm eval validate tests/fixtures/tasks/unknown-property.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.additional_property` at `/unexpected` |
| `GATE-V0-003` | `pnpm eval validate tests/fixtures/tasks/missing-required-field.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.required` at `/title` |
| `GATE-V0-004` | `pnpm eval validate tests/fixtures/tasks/unsupported-major-schema-version.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.unsupported_major` at `/schemaVersion` |

## Red evidence

Command:

```bash
node --test tests/gate/v0-contract-validation.test.mjs
```

Observed: failed as intended. The assertion expected exit code 0 and received
1. The direct public command reports:

```text
ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND No package.json (or package.yaml, or package.json5) was found.
```

This is a missing V0 public CLI/package scaffold, not a test-runner or fixture
syntax failure: Node `v26.4.0` and pnpm `10.34.2` are available, and the test
runner executed the assertion normally.

## Green evidence

Commands:

```bash
node --test tests/gate/v0-contract-validation.test.mjs
node --test tests/gate/v0-contract-errors.test.mjs
```

Observed on 2026-07-17: `GATE-V0-001` passed (1/1), and the three invalid
fixture cases passed (3/3).

## Scope boundary

- This slice covers only pure Task YAML structural validation and the supported
  schema major check.
- Cache preflight, sensitive-data validation, task execution, and all later
  runtime packages remain outside this V0 slice.

## Handoff

V0's requested contract-validation slice is green. Do not begin later runtime
stages without a separately approved stage and gate.

## 2026-07-17 — V0.2 gate

| Test ID | Public seam | Test file | Expected behavior |
|---|---|---|---|
| `GATE-V0-005` | `pnpm eval validate examples/result.json` | `tests/gate/v0-result-validation.test.mjs` | Exit 0 with structured Result success |
| `GATE-V0-006..008` | `pnpm eval validate <invalid-result>` | `tests/gate/v0-result-validation.test.mjs` | Stable unknown-property, required-property, and unsupported-major errors routed as Result |
| `GATE-V0-009` | `pnpm eval checksum <task-dir>` | `tests/gate/v0-checksum.test.mjs` | Sorted deterministic bundle checksum, symlinks skipped, byte changes detected |
| `GATE-V0-010` | `pnpm eval checksum <task-yaml>` | `tests/gate/v0-checksum.test.mjs` | Deterministic single-file checksum |

Red commands:

```bash
node --test tests/gate/v0-result-validation.test.mjs tests/gate/v0-checksum.test.mjs
node --test tests/gate/v0-result-validation.test.mjs
```

Observed: the combined run failed 4/6 because Result success, Result major-version
routing, and both checksum forms were absent. After requiring invalid outputs to
identify their selected schema, the focused Result run failed 4/4. These are
intended missing V0.2 behaviors at the public CLI seam.

Green evidence:

```bash
pnpm install
pnpm -r build
node --test tests/gate/*.test.mjs
pnpm check:generated
```

Observed: all commands exited 0; the complete gate suite passed 10/10. A focused
checksum regression also captured the difference between recursive directory
ordering and globally sorted relative paths before the manifest sort was fixed.

## 2026-07-17 — V0.3 contract matrix gate

| Test ID | Public seam | Test file | Expected behavior |
|---|---|---|---|
| `GATE-V0.3-<kind>` | compiled `eval validate <fixture>` CLI | `tests/gate/v0-contract-matrix.test.mjs` | Every canonical kind accepts its valid fixture and names the selected kind |
| `GATE-V0.3-<kind>` invalid matrix | same | same | Unknown property and missing required field return stable codes and JSON Pointers; unsupported major wins before structural errors |

Red command:

```bash
node --test tests/gate/v0-contract-matrix.test.mjs
```

Observed: red, 0/18 passing. The sixteen new kinds were routed to the existing
Task or Result schema, while the Task and Result unknown-major fixtures returned
the deliberately competing additional-property error instead of
`schema.unsupported_major`.

Green evidence:

```bash
pnpm install
pnpm -r build
node --test tests/gate/*.test.mjs
pnpm check:generated
```

Observed: all commands exited 0. The complete gate suite passed 28/28: the
original 10 gates remained green and all 18 contract-matrix cases passed.

## 2026-07-17 — V1.1 SQLite state-store gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V1.1-001` | `openStateStore` | Fresh migration is recorded with a checksum; reopen is idempotent |
| `GATE-V1.1-002` | `openStateStore` | Existing DB is timestamp-backed-up before its first migration |
| `GATE-V1.1-003` | `openStateStore` | Unknown newer migration is refused |
| `GATE-V1.1-004` | `eval run create/show --repair` | Run+transition are durable, repeated input creates a new Run, and canonical input repairs byte-identically |
| `GATE-V1.1-005` | `eval run create` | Existing preflight rejection codes survive and no DB/Run is created |
| `GATE-V1.1-006` | `eval run create` | A changed checksum for the same Task version is rejected without a second Run |

Scope excludes Attempts, leases, reconciliation beyond explicit input repair,
sandboxing, adapters, evaluators, Artifact staging, and export.

Red: `node --test tests/gate/v1-state-store.test.mjs` failed 0/6 at the missing
package and CLI seams. Green: the focused gate passed 6/6; the complete gate
suite passed 40/40.

## 2026-07-17 — V1.2 Attempt lifecycle gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V1.2-001` | `eval run execute/show` | No-op Run and Attempt persist the complete ordered lifecycle and finish `COMPLETED`/`SUCCEEDED` |
| `GATE-V1.2-002..004` | compiled `RunExecutor` with fault fakes | Agent faults cross the evaluation barrier; evaluator and exhausted infrastructure faults remain orthogonally classified with producer records |
| `GATE-V1.2-005..006` | compiled `RunExecutor`/state store | Illegal transitions change nothing and Agent outcome is write-once |
| `GATE-V1.2-007` | transition-commit hook plus `eval run show` | Injected interruption exposes the last committed, non-completed resumable state |

Red command: `node --test tests/gate/v1-run-lifecycle.test.mjs`.
Observed: 0/7 passed. `run execute` returned the existing `cli.usage` response,
and direct lifecycle cases failed because `packages/run-coordinator` did not
exist. The runner, existing Run creation seam, and fixtures executed normally.

Green: the focused V1.2 gate passed 7/7. Full verification passed `pnpm
install`, `pnpm -r build`, all 47/47 gate tests, and `pnpm check:generated`.
The slice excludes real sandbox/adapter/evaluator work, leases/reconciliation,
Artifact staging/scanning, and export.

## 2026-07-17 — V1.3 lease, Artifact commit, and reconciliation gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V1.3-001` | `RunExecutor` plus `eval run execute` | Live owner heartbeats; competing CLI execution fails with `EXECUTOR_LEASE_HELD`; release follows completion |
| `GATE-V1.3-002` | state-store lease repository | A provably dead PID permits transactional takeover while live PID identity remains protected |
| `GATE-V1.3-003` | `eval run execute/show` | Two no-op Artifacts, manifest, SQLite rows, canonical Result, and derived `result.json` have matching checksums |
| `GATE-V1.3-004..005` | Artifact commit hooks plus `eval run doctor` | Pre-manifest staging is quarantined; post-manifest/pre-record publication is reported and never healthy |
| `GATE-V1.3-006` | `eval run doctor` | Missing or corrupt derived `result.json` is regenerated byte-identically from SQLite |
| `GATE-V1.3-007` | `ArtifactStoreFs.stage` | Parent traversal and symlink traversal fail with `UNSAFE_ARTIFACT_PATH` |

Focused red command: `node --test tests/gate/v1-lease-artifacts.test.mjs`.
Scope excludes Docker/sandbox, adapter stdio, real evaluators, isolated scanner
workers/full coverage policy machinery, and requester export.

Red result: 0/7 passed before production edits. Focused green result: 7/7.
The exact full verification sequence passed `pnpm install`, `pnpm -r build`,
all 54/54 gate tests, and `pnpm check:generated`.

## 2026-07-17 — V1.4 requester-safe export gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V1.4-001` | `eval run export --audience requester` | A completed Run produces an independently schema-valid, checksum-bound requester result/manifest, a passed audit row, and no maintainer-only marker bytes |
| `GATE-V1.4-002` | same CLI plus `run show` | A non-completed Run records `EXPORT_RUN_NOT_COMPLETED`, creates no export tree, and leaves Run state unchanged |
| `GATE-V1.4-003` | same CLI plus SQLite audit seam | A credential in a requester-safe Artifact records `DATA_SCAN_CREDENTIAL_DETECTED`; restoring the bytes permits a new export attempt with a new ID |

Focused gate command: `node --test tests/gate/v1-export.test.mjs`.
Scope excludes Docker/sandbox, adapter stdio, real evaluators, scanner-worker
isolation, and network policy enforcement.

Red result: 0/3 at the missing CLI route. Focused green result: 3/3. The exact
full verification sequence passed `pnpm install`, `pnpm -r build`, all 57/57
gate tests, and `pnpm check:generated`.

## 2026-07-17 — V2.1 adapter protocol runtime gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V2.1-001` | `eval run execute --agent mock`, Run view, SQLite, Artifact tree | Mock subprocess handshakes, tools, completes, persists ordered frames before the canned result, and finalizes events/stderr/patch |
| `GATE-V2.1-fault-*` | `SubprocessAgentPhase` with `tests/fixtures/adapters` | Malformed, oversized, gap, stall, crash, and version faults retain exact classification and producer evidence |
| `GATE-V2.1-008` | duplicate-seq fixture and persisted frame repository | Duplicate input is ignored idempotently and not persisted twice |
| `GATE-V1.4-004` | requester export CLI and SQLite audit table | Missing Run returns `RUN_NOT_FOUND`, non-zero, with no audit row |

Focused red command: `node --test tests/gate/v2-adapter-protocol.test.mjs`.
Scope excludes the V2.2 Tool Router, Docker/sandbox/network policy, real model
providers, evaluators, and remote credentials.

Red result: 0/9 at the absent CLI/config/runtime/export seams. Focused green:
9/9. Exact full verification passed 66/66 after updating migration-5
expectations and preventing concurrent `pnpm eval` builds from racing on
shared compiled files.

## 2026-07-17 — V2.2 Tool Router gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V2.2-001` | compiled `ToolExecutor` with fake workspace runner | An allowlisted `echo` call is accepted, executed, counted, and durably completed |
| `GATE-V2.2-002..003` | policy table plus scripted Mock Adapter | Four allowed tools pass; disallowed tools and parent/absolute/forbidden paths return durable `TOOL_POLICY_DENIED` results |
| `GATE-V2.2-004..004b` | scripted subprocess plus lifecycle/frames/Result | Each budget emits its exact stable code and `budget_update`; heartbeat-only wall overrun also terminates as `budget_exhausted` |
| `GATE-V2.2-005` | ToolExecutor, Artifact store, SQLite, protocol frame | Oversized output has no inline text, carries an explicit marker/private Artifact ref, and records full byte counters |
| `GATE-V2.2-006` | persisted tree and SQLite byte scan | Planted tool-output and stderr credentials appear only as deterministic redaction markers |
| `GATE-V2.2-007` | child environment and policy result | Adapter sees only allowlisted variables; proxy/DNS/network overrides return `TOOL_ENV_OVERRIDE_DENIED` |
| `GATE-V2.2-008` | fake runner observing durable repositories | Redacted accepted frame and `tool_calls.status=accepted` exist before runner execution |

Initial scope is the smallest tracer bullet. After red evidence, expand the
same public seam and subprocess integration gate across policy denials, all
three budgets, truncation/Artifact staging, redaction, Adapter environment
isolation, scripted Mock Adapter scenarios, persistence ordering, and Result
efficiency counters. Real Docker, network enforcement, evaluators, remote
providers, and the dependency proxy remain excluded.

Red: 0/1 at the missing `packages/tool-router` public seam. Focused green:
9/9 V2.2 and 18/18 across V2.1–V2.2. Exact final verification passed all
75/75 gates plus install, recursive build, and generated-output drift check.

## 2026-07-17 — V3.1 real Docker workspace sandbox gate

| Test ID | Public seam | Expected behavior |
|---|---|---|
| `GATE-V3.1-001` | `DockerSandboxRuntime` with fake Docker client | Unreachable daemon and absent pinned image fail before Agent execution with `DOCKER_UNAVAILABLE` and `SANDBOX_IMAGE_UNAVAILABLE` |
| `GATE-V3.1-002` | runtime lifecycle plus `WorkspaceRunner` | Attempt container is created before tools with network none, read-only root, non-root UID, no-new-privileges, limits, read-only bundle and explicit writable prefix mount |
| `GATE-V3.1-003` | runtime cleanup | Attempt-keyed cleanup removes the container once and repeated cleanup is harmless |
| `GATE-V3.1-004` | writable-prefix validator and Task preflight | Only terminal directory-prefix patterns such as `src/**` pass; unsupported glob shapes reject before a Run |
| `GATE-V3.1-Docker` | `eval run create/execute/show --sandbox docker` | Real pinned container completes a Mock Adapter run, captures the allowed write in `patch.diff`, blocks a protected write at the OS boundary, runs commands non-root, disappears after the Run, and does not leak state to Run 2 |

Focused red command: `node --test tests/gate/v3-sandbox-unit.test.mjs`.
Observed red: 0/4 passed; all four tests reached the intended absent
`packages/sandbox-docker/dist/index.js` public seam. Production changes before
red: none. V3.2 networks/proxy and V3.3 phase-barrier/snapshot/no-follow
collector work remain excluded.

Green: the four fake-client/public-preflight gates passed. The complete gate
suite finished with 79 passed, 0 failed, and the one real-Docker test skipped
with explicit `DOCKER_UNAVAILABLE` evidence because this managed shell could
not access the running OrbStack daemon socket.

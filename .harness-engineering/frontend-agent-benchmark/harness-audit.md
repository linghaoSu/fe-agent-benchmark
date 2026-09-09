# Harness Audit — Frontend Agent Benchmark V1.3

**Date:** 2026-07-17  
**Mode:** audit  
**Scope:** execution lease, Artifact commit, canonical Result, and reconciliation

## Layer scores

| Layer | V1.3 evidence | Score |
|---|---|---|
| Cognition | No model behavior added; no-op phases remain bounded | pass |
| Tools | Filesystem writes reject absolute/parent/symlink paths and use no-follow opens | pass |
| Contracts | Generated Evaluator/Result/manifest payloads validate before persistence | pass |
| Orchestration | SQLite transitions precede phases; global lease surrounds execution; `COMPLETED` requires Result + manifest rows | pass |
| Memory/state | Migration 3 adds lease, Artifact, manifest, and immutable Result records; derived Result is repairable | pass |
| Evaluation/observation | No-op evaluator produces a real maintainer-only result Artifact and checksum evidence | pass |
| Constraints/recovery | Crash hooks cover pre-manifest and post-rename/pre-record boundaries; doctor quarantines or reports both | pass |

## Critical path trace

1. `RunExecutor.execute` acquires `global-executor`, heartbeats at a timer and every transition, and releases in `finally`.
2. Attempt transitions to `FINALIZING`; staged text Artifacts are checksum-verified and deterministically credential-scanned.
3. `manifest.json` is written/fsynced last; the Attempt directory is renamed and its parent fsynced.
4. Manifest and Artifact rows commit in one SQLite transaction; the Attempt may then reach `SUCCEEDED`.
5. Run reaches `AGGREGATING`; canonical Result JSON/checksum commits to SQLite, derived `result.json` is atomically written and verified, then the Run reaches `COMPLETED`.
6. `run doctor` holds the same global lease, quarantines `.tmp`, repairs derived input/Result from SQLite, and verifies every manifest and Artifact checksum before reporting healthy.

## Ranked findings

### Critical

None.

### Warning

None in the requested V1.3 slice. Binary/complex Artifact scanning fails closed with `ARTIFACT_SCAN_UNSUPPORTED`; the isolated scanner-worker and full coverage policy remain explicitly deferred.

### Info

- Foreign live PIDs whose start identity cannot be inspected are conservatively treated as live owners; this can delay takeover but cannot permit concurrent execution.
- A crash after canonical Result commit leaves the Run in `AGGREGATING`; doctor repairs `result.json` but intentionally does not invent a completion transition.
- `state.json`, Docker cleanup/absence proof, adapter protocol, real evaluators, scanner-worker machinery, and export are later approved stages, not V1.3 gaps.

## Executable evidence

- `tests/gate/v1-lease-artifacts.test.mjs`: lease contention/heartbeat/release, dead-PID takeover, commit checksums, two crash boundaries, Result repair, unsafe paths.
- `tests/gate/v1-run-lifecycle.test.mjs`: ordered durable Run/Attempt transitions and fault classifications.
- SQLite triggers reject `COMPLETED` without a canonical Result and finalized manifest.

## Next action

Run the required full V1.3 verification sequence and retain the explicit later-stage boundaries above.

---

# V1.4 requester export addendum

**Date:** 2026-07-17  
**Mode:** audit  
**Scope:** requester-safe export policy, audit persistence, and atomic publication

## Layer scores

| Layer | V1.4 evidence | Score |
|---|---|---|
| Cognition | Public outcome mapping is a fixed versioned table, not inferred from hidden text | pass |
| Tools | Export reads finalized rows/files and publishes through a staged directory rename | pass |
| Contracts | Canonical, requester-result, and export-manifest documents validate before publication | pass |
| Orchestration | Only `COMPLETED` Runs export; denial returns non-zero without a Run transition | pass |
| Memory/state | Migration 4 stores immutable passed/denied audit attempts with policy versions | pass |
| Evaluation/observation | Result/manifest and copied requester-safe bytes are checksum-bound in the audit/manifest | pass |
| Constraints/recovery | Reference/credential checks fail before publication; caught publication faults roll back | pass with warning |

## Ranked findings

### Critical

None.

### Warning

- SQLite and filesystem publication cannot share one transaction. A process death after the
  requester directory rename and before the passed audit insert can leave an unaudited export;
  caught failures do roll back. Add export reconciliation when crash-recovery work expands
  beyond this gate slice.

### Info

- Re-export after a denial is independent and receives a new audit ID.
- Maintainer-only paths/bytes are never copied; safe candidate bytes are scanned again at export.
- Scanner-worker isolation, Docker, adapter stdio, real evaluators, and network enforcement remain
  explicitly outside V1.4.

## Executable evidence

- `tests/gate/v1-export.test.mjs`: schema/checksum/audit success, private-marker exclusion,
  non-completed denial, credential denial, Run-state preservation, and fixed retry.
- `packages/export-policy/src/index.ts`: fixed taxonomy, closure/credential gates, staged publish,
  and rollback.
- `packages/state-store-sqlite/migrations/004_exports.sql`: append-only audit contract.

## Next action

Run the exact V1.4 full verification sequence; defer cross-store crash reconciliation to the
approved recovery stage unless a crash-injection gate is added now.

---

# V2.1 Adapter protocol runtime addendum

**Date:** 2026-07-17  
**Mode:** audit  
**Scope:** JSONL codec, coordinator session, subprocess Mock Adapter, frame persistence

## Layer scores

| Layer | V2.1 evidence | Score |
|---|---|---|
| Cognition | Mock behavior is deterministic from Task context and uses no model/provider | pass |
| Tools | The only V2.1 Tool Router fake is a bounded in-process echo with no Sandbox side effect | pass |
| Contracts | Every inbound/outbound frame validates against the canonical schema; size is checked before acceptance | pass |
| Orchestration | Handshake, direction, sequence, heartbeat, cancel deadline/kill, complete, and shutdown are coordinator-owned | pass |
| Memory/state | Migration 5 stores accepted frames append-only with unique Attempt/direction/seq before dispatch | pass |
| Evaluation/observation | Accepted Agent events, patch, and stderr become checksum-bound Artifacts; failures receive producer records | pass |
| Constraints/recovery | Stable protocol faults terminate locally and cross the existing evaluation barrier without retry | pass with warning |

## Critical path trace

1. `RunExecutor` creates the Attempt and enters `AGENT_RUNNING` before spawning the registered command.
2. `FrameDecoder` enforces UTF-8 JSONL and byte limits; `CoordinatorSession` validates schema, identity, direction, handshake, and exact next sequence.
3. The accepted inbound frame commits to `adapter_frames` before the host dispatches an event or calls the canned echo handler; outbound frames commit before stdin write.
4. Duplicate sequences return without persistence or dispatch. Gaps and all other protocol faults send `cancel`, wait the configured grace period, then kill.
5. A valid `complete` stores deterministic events/patch/stderr for Attempt finalization, sends `shutdown`, and preserves the existing V1 Agent-failure/evaluation classification barrier.

## Ranked findings

### Critical

None.

### Warning

- A hard Coordinator process death cannot run the in-memory cancel deadline and does not persist
  the Adapter PID for later cleanup. The global execution lease prevents concurrent replay, but a
  non-cooperative orphan can survive until its own parent-death/stdio behavior ends it. Persisted
  subprocess ownership and startup orphan cleanup belong with the V3 process/phase-barrier work.

### Info

- `maxFrameBytes=65536` and `heartbeatTimeoutSeconds=1` are immutable resolved Run inputs; the
  kill grace is a host cleanup detail rather than an Adapter budget.
- `ADAPTER_PROCESS_EXITED` is a stable Adapter-host failure code, separate from the six protocol
  parser/state-machine codes.
- V2.2 policy, budgets, truncation, and real Sandbox tools remain intentionally absent.

## Executable evidence

- `tests/gate/v2-adapter-protocol.test.mjs`: Mock lifecycle, ordered durable frames, persistence
  before tool result, all requested fault subprocesses, duplicate rejection, and Artifact output.
- `packages/state-store-sqlite/migrations/005_adapter_frames.sql`: unique append-only frame log.
- Focused gate result: 9/9 passed after the V2.1 implementation.

## Next action

Run the exact full repository verification sequence and keep subprocess-orphan cleanup assigned to
the V3 process/phase-barrier stage.

---

# V2.2 Tool Router addendum

**Date:** 2026-07-17  
**Mode:** audit  
**Scope:** ToolExecutor policy, budgets, output handling, persistence, and Adapter boundary

## Layer scores

| Layer | V2.2 evidence | Score |
|---|---|---|
| Cognition | Tool decisions are deterministic policy-table checks; the Adapter cannot override them | pass |
| Tools | Four tools execute only through the bounded fake in-memory runner seam | pass |
| Contracts | Tool frames, stable denial/budget codes, Artifact refs, and efficiency fields are schema-bound | pass |
| Orchestration | Accepted frame and `tool_calls` row precede execution; denial continues; budget exhaustion cancels the phase | pass |
| Memory/state | Migration 6 records accepted-to-completed Tool Call state with bounded/redacted arguments | pass with warning |
| Evaluation/observation | Result efficiency aggregates calls, output bytes, and wall time; policy/budget outcomes remain inspectable | pass |
| Constraints/recovery | Output is bounded/redacted, large output is private, Adapter env is allowlisted, and wall time has an independent deadline | pass with warning |

## Critical path trace

1. `CoordinatorSession` validates and persists the redacted inbound `tool_request` before dispatch.
2. `ToolExecutor` persists `accepted`, checks wall/call budgets, env overrides, tool/path policy, then invokes the fake runner.
3. Policy denial completes the row and returns a rejected `tool_result`; budget exhaustion completes the row, emits `budget_update`, cancels, and maps to `agent_outcome=budget_exhausted`.
4. Output is credential-redacted, byte-counted, and either returned inline or staged as a `maintainer_only` Artifact reference with an explicit marker.
5. Final Result efficiency uses the Attempt's ToolExecutor counters; Adapter stderr and accepted protocol frames are redacted before persistence.

## Ranked findings

### Critical

None.

### Warning

- A hard Coordinator death after `tool_calls.status=accepted` but before completion intentionally leaves an incomplete durable row. Existing staging reconciliation quarantines partial Artifact bytes and the Attempt remains non-terminal, but `run doctor` does not yet annotate the Tool Call row. Add Tool Call reconciliation with the later resumable/orphan-cleanup stage rather than guessing an outcome during V2.2.

### Info

- The fake runner caps synthetic repeat output at the default total-output ceiling plus one byte-scale unit; real streaming/process enforcement belongs to the future Sandbox runner seam.
- Real filesystem/command execution, Docker, network policy, dependency proxy, remote providers, and real evaluators remain outside V2.2.

## Executable evidence

- `tests/gate/v2-tool-router.test.mjs`: policy table, scripted denials, all three budgets, heartbeat-only wall deadline, truncation/private Artifact, byte scan redaction, env allowlist/override, and pre-execution persistence.
- `tests/gate/v2-adapter-protocol.test.mjs`: all V2.1 protocol/fault behavior remains green with ToolExecutor wired in.
- Focused result: 18/18 passed across V2.1 and V2.2 after the audit hardening.

## Next action

Run the exact full repository verification sequence and retain Tool Call crash reconciliation for the approved resumability stage.

---

# V3.1 Docker workspace runtime addendum

**Date:** 2026-07-17  
**Mode:** audit  
**Scope:** real Docker workspace lifecycle beneath the existing Tool Router seam

## Layer scores

| Layer | V3.1 evidence | Score |
|---|---|---|
| Cognition | The Mock Adapter remains deterministic; Sandbox selection and image resolution are fixed Run inputs | pass |
| Tools | `read_file`, `write_file`, and `run_command` retain the single ToolExecutor policy/budget/truncation/redaction path and execute through one container boundary | pass |
| Contracts | Unsupported writable glob shapes fail Task preflight; daemon, image, startup, patch, and cleanup failures use stable codes | pass |
| Orchestration | Container start precedes `AGENT_RUNNING`; patch capture and idempotent cleanup occur in `AGENT_STOPPING` before `WORKSPACE_FROZEN` | pass |
| Memory/state | Run input records runner, pinned image digest, user, and resource limits; execute rejects a runner mismatch | pass |
| Evaluation/observation | The captured deterministic workspace diff replaces an Adapter-supplied patch and is staged through the existing Artifact path | pass |
| Constraints/recovery | Root/bundle are read-only, writable/protected prefixes are explicit nested mounts, tools use UID 1000, network is none, Docker calls are time-bounded, and cleanup failure prevents Attempt success | pass with evidence gap |

## Critical path trace

1. Run creation resolves a digest-pinned image and records `sandbox.runner`, image reference/digest, non-root user, and limits.
2. `DockerSandboxRuntime.start` checks the daemon and local image before copying the public bundle and creating the Attempt-named container.
3. Container creation uses network none, read-only root, no-new-privileges, dropped capabilities, non-root UID, resource limits, a read-only bundle, explicit writable/protected mounts, and isolated `/tmp`.
4. Adapter Tool Calls persist and pass through ToolExecutor before Docker exec; shell and file tools therefore share the same UID/mount boundary.
5. After Agent stop, the runtime reconstructs a deterministic current tree from writable mounts, emits `patch.diff`, removes the container and temporary mounts, and only then permits workspace freeze/evaluation.
6. Startup/image/daemon faults leave `agent_outcome=not_started`; patch or cleanup faults terminate the Attempt as `infrastructure_error`, and `SANDBOX_CLEANUP_FAILED` cannot reach success.

## Ranked findings

### Critical

None.

### Warning

- The real-Docker gate could not execute in the managed verification shell because access to the OrbStack socket was denied. Fake-client lifecycle/security configuration gates passed, but OS behavior remains a recorded evidence gap until the same suite runs where the daemon socket is reachable.

### Info

- Hard Coordinator-death container/process census and no-follow submission collection remain explicitly assigned to V3.3; per-Attempt networks and proxy policy remain V3.2.
- Docker CLI calls and host patch generation are bounded by the recorded Run wall limit, so a wedged daemon or command cannot block indefinitely.

## Executable evidence

- `tests/gate/v3-sandbox-unit.test.mjs`: daemon/image codes, locked-down create spec, lifecycle ordering, cleanup idempotence/failure code, and writable-prefix preflight.
- `tests/gate/v3-sandbox-docker.test.mjs`: pinned real-container Mock run, allowed patch, OS-level protected write denial, non-root UID, removal, and fresh Run 2; currently skipped with explicit `DOCKER_UNAVAILABLE` evidence.
- Full repository result: 79 passed, 1 skipped, 0 failed before the timeout hardening; the focused V3.1 rerun passed 4 and skipped the same real-Docker gate.

## Next action

Run `node --test tests/gate/v3-sandbox-docker.test.mjs` from a shell permitted to access the running Docker daemon.

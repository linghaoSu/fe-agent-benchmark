# Harness Design — Frontend Coding Agent Benchmark

**Slug:** `frontend-agent-benchmark`  
**Date:** 2026-07-10  
**Status:** architecture input

## Agent Summary

This harness runs a trusted, registered Agent Adapter on the host while confining every model-proposed file, shell, and browser action to a Docker sandbox. A Run may contain one infrastructure retry, each represented as a separate Attempt. The harness must halt rather than degrade when hidden-test isolation, integrity, schema validation, or critical gates cannot be proven.

## Four Principles

- **Constrain, don't instruct:** the Coordinator enforces legal state transitions, budgets, tool permissions, and evaluator ordering; the model can only propose actions through typed tool requests.
- **Externalize state:** SQLite is authoritative for Run and Attempt metadata; an atomic `state.json` snapshot is derived after each committed transition for local recovery diagnostics.
- **Verify every step:** JSON Schema validates every external boundary; deterministic evaluators validate outputs before any optional subjective judgment.
- **Fail locally:** tool failures affect one Tool Call, Adapter failures affect one Attempt, and retryable infrastructure failures may create at most one new Attempt.

## Layer 1 — Cognition

- The benchmark does not impose one universal model prompt. Each registered Adapter owns its versioned Agent configuration and declares capabilities during protocol handshake.
- The model proposes Tool Calls and completion. It cannot directly mutate host state, choose evaluator ordering, alter budgets, classify its own failure, or mark a Run solved.
- Agent execution and evaluation are separate roles and phases. The Agent has no evaluator context; deterministic evaluators operate only after the Agent and all child processes stop.

## Layer 2 — Tools

| Tool family | Execution boundary | Result treatment | Hard cap before Adapter/model |
|---|---|---|---|
| Filesystem read/search | Docker workspace, policy-checked paths | Stable relative paths; deduplicate repeated matches | 64 KiB or 2,000 lines per call |
| Filesystem edit | Docker workspace, writable-path allowlist | Return changed paths and bounded diff summary | 128 KiB diff; full patch remains Artifact |
| Shell | Docker process with wall-time/output limits | Keep exit code and first actionable error; full log to Artifact | 128 KiB combined stdout/stderr |
| Browser inspect/action | Docker-local app with fresh Agent browser profile | Structured DOM/console/network summaries; images as Artifact refs | 64 KiB structured payload |
| Screenshot/trace | Artifact Store only | Return checksum, dimensions, MIME type, and relative path | Metadata only; binary never enters model context |

All caps are protocol defaults and may be lowered by Task budget. Truncation is explicit (`truncated: true`, original byte count, Artifact reference) rather than silent.

## Layer 3 — Contracts & Interfaces

JSON Schema Draft 2020-12 is the only contract source. TypeScript types are generated.

| Boundary | Schema | Enforcement point |
|---|---|---|
| Task Bundle | `task.schema.json` + semantic rules | CLI preflight before Run creation |
| Suite snapshot | `suite.schema.json` | Registry publish and Run resolution |
| Adapter handshake/events | `adapter-protocol.schema.json` | Both Coordinator ingress and Adapter test kit |
| Tool request/result | `tool-call.schema.json` | Tool Router before and after execution |
| Run/Attempt state | `run.schema.json`, `attempt.schema.json` | SQLite repository transaction boundary |
| Evaluator result | `evaluator-result.schema.json` | Evaluator Host before aggregation |
| Artifact manifest | `artifact-manifest.schema.json` | Manifest finalization and startup reconciliation |
| Final result | `result.schema.json` | Aggregator output and CLI read path |

Protocol invariants:

- First Adapter message is `hello` with protocol version, Adapter identity, capabilities, model metadata, and requested tools.
- Every message has `runId`, `attemptId`, monotonic `seq`, timestamp, and bounded payload.
- Coordinator is the only issuer of Tool Call IDs and cancellation/budget decisions.
- Unknown major versions fail preflight; unknown message types within a supported major version fail the Attempt.
- Secrets are redacted before event persistence and never passed into Docker.

## Layer 4 — Orchestration

```text
Run: CREATED → PREFLIGHT → ATTEMPT_ACTIVE → AGGREGATING → COMPLETED
                 │               │               └──────→ FAILED
                 └───────────────┴──────────────────────→ FAILED

Attempt:
CREATED → SANDBOX_STARTING → AGENT_RUNNING → AGENT_STOPPING
        → WORKSPACE_FROZEN → EVALUATING → FINALIZING → SUCCEEDED
             │                    │             │
             └────────────────────┴─────────────┴──────→ FAILED
```

- The Coordinator owns transitions and persists each transition transactionally before emitting the corresponding event.
- `AGENT_STOPPING → WORKSPACE_FROZEN` requires the phase barrier: Adapter exited, cancellation acknowledged or timed out, all Agent child processes gone, Agent browser process/profile removed, final patch captured, and no hidden bundle present.
- Only after `WORKSPACE_FROZEN` may the Coordinator let the host-only Evaluator Host read the hidden bundle and create a fresh evaluator browser profile. The hidden bundle is never mounted or copied into the Sandbox.
- A retryable Infrastructure Error on Attempt 1 may create Attempt 2 from the original immutable Task inputs. No later retry is legal.
- Agent Failure, Invalid, Budget Exhausted, and deterministic evaluator failure never transition to automatic retry.

## Layer 5 — Memory & State

### Authoritative state

SQLite holds Run, Attempt, transition, version, retry, and failure metadata. Events are append-only JSONL Artifacts; large payloads are external Artifact references.

### Derived `state.json` schema

```json
{
  "schemaVersion": 1,
  "runId": "run_...",
  "status": "created|running|aggregating|completed|failed",
  "activeAttemptId": "attempt_...|null",
  "currentPhase": "preflight|sandbox|agent|freeze|evaluation|finalize|null",
  "lastCommittedTransitionSeq": 12,
  "attemptCount": 1,
  "artifactManifestPath": "manifest.json|null",
  "updatedAt": "RFC3339"
}
```

Invariants:

- SQLite commits first; `state.json` is then written to a sibling temporary file, fsynced, and atomically renamed.
- On mismatch, SQLite wins and regenerates `state.json`; the mismatch is recorded as a recovery event.
- A completed Run is immutable. Comparisons read only completed Results.
- Run inputs, seed, Task Bundle checksum, environment digest, and Adapter configuration are immutable across Attempts.

## Layer 6 — Evaluation & Observation

- Preflight: schema, semantic rules, Docker/image availability, disk space, Task checksum, Suite membership.
- Agent phase: protocol validation, heartbeat, budget counters, permission decisions, command exits, browser/tool evidence.
- Phase barrier: process census, hidden-bundle absence, browser-profile removal, patch/workspace checksum.
- Evaluator phase: Integrity → Build → Functional → Visual/Responsive → Accessibility → Engineering.
- Aggregation: explicit gate table decides `valid` and `solved`; efficiency remains a separate vector.
- Calibration: Gold and Alternative must pass; every declared Mutation must fail with an expected stable code.
- No LLM/VLM Judge in the MVP deterministic path.

Metrics separate Agent quality from platform reliability: Run-level success@k excludes infrastructure retry Attempts; raw and post-retry infrastructure failure rates are reported separately.

## Layer 7 — Constraints & Recovery

| Failure | Local action | Retry rule | Recovery evidence |
|---|---|---|---|
| Adapter protocol/schema error | Cancel Adapter, stop Agent phase | No automatic retry | Last valid seq, invalid payload hash, stderr Artifact |
| Tool timeout/output overflow | Kill tool process, return bounded failure | Agent may react within remaining budget | Tool Call event and full bounded log Artifact |
| Docker/image/startup failure | Clean partial sandbox | One Infrastructure retry | Attempt failure code and cleanup result |
| Agent crash/budget exhaustion | Stop descendants, freeze if safe | No automatic retry | Exit/termination reason and final patch |
| Phase barrier cannot prove cleanup | Destroy sandbox; do not inject hidden data | Infrastructure retry once | Process census and cleanup error |
| Evaluator crash | Stop remaining evaluators, preserve completed results | No automatic retry in MVP | Evaluator event and stderr Artifact |
| SQLite/Artifact partial write | Quarantine staging directory; reconcile from committed DB row and finalized manifest | Resume finalization, not Agent execution | Recovery event and checksum diff |
| Coordinator interruption | Acquire Run lease, inspect last committed transition, clean or resume only idempotent phase | Never replay Agent phase inside an existing Attempt | Lease and reconciliation log |

Cleanup is idempotent. Run directories are staged under `.tmp/<run-id>/<attempt-id>` and become visible only through atomic rename/finalized manifest. Orphan detection uses a lease with owner PID and heartbeat; stale leases trigger reconciliation, not blind deletion.

## Day 1 MVP Checklist

- [ ] SQLite Run/Attempt tables plus atomically derived `state.json`, loaded and reconciled at CLI start
- [ ] Retry wrapper only for classified infrastructure startup/cleanup operations; maximum one new Attempt
- [ ] JSON Schema validation on Task, protocol messages, Tool Calls, evaluator results, manifests, and final Result
- [ ] Per-tool output caps and Artifact references as defined above
- [ ] Append-only event sequencing with heartbeat, cancellation, max-line size, and redaction
- [ ] Phase-barrier verification before host-only hidden evaluation begins; no hidden material enters the Sandbox

## Assumptions

- Host, Coordinator, Docker daemon, and registered Adapter code are trusted.
- Model-generated actions and all code executed in Docker are untrusted.
- Docker provides the MVP isolation boundary; hostile multi-tenant workloads are out of scope.
- The model provider may be external, but credentials remain host-side and never enter the Task workspace or persisted raw logs.

## Open Questions

- Exact protocol frame size and heartbeat interval should be measured in the vertical slice; defaults above are upper bounds, not product requirements.
- Whether visual evaluator baselines use raw pixel diff, perceptual metrics, or both remains an evaluator-level reversible choice.

## Non-goals

- Distributed scheduling, remote Adapter services, multi-tenant isolation, microVMs, cloud Artifact storage, public leaderboard, and long-horizon context reset.

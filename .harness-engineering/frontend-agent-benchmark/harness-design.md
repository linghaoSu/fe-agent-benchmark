# Harness Design — Frontend Coding Agent Benchmark

**Slug:** `frontend-agent-benchmark`  
**Date:** 2026-07-13  
**Status:** architecture input — synchronized with approved R1–R9 revision

## Agent Summary

This harness runs a trusted, registered Agent Adapter on the host while confining every model-proposed file, shell, and browser action to a Docker sandbox. The Adapter may call a configured remote model provider only from this trusted host control plane; that capability never opens Docker egress or conveys credentials, endpoints or raw sensitive responses into Sandbox/Artifacts. Agent and Evaluation Sandbox execution use default-deny networks, with only declared in-Run peers and a snapshot-bound controlled dependency proxy allowed. A Run may contain one infrastructure retry, each represented as a separate Attempt. The harness must halt rather than degrade when hidden-test isolation, integrity, schema validation, network policy, data hygiene, or critical gates cannot be proven.

## Four Principles

- **Constrain, don't instruct:** the Coordinator enforces legal state transitions, budgets, tool permissions, and evaluator ordering; the model can only propose actions through typed tool requests.
- **Externalize state:** SQLite is authoritative for Run and Attempt metadata; an atomic `state.json` snapshot is derived after each committed transition for local recovery diagnostics.
- **Verify every step:** JSON Schema validates every external boundary; deterministic evaluators validate outputs before any optional subjective judgment.
- **Fail locally:** tool failures affect one Tool Call, Adapter failures affect one Attempt, and retryable infrastructure failures may create at most one new Attempt.
- **Separate audiences:** raw hidden evidence is maintainer-only; requester output is a separately built, allowlisted export that cannot affect the completed Run.

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
| Dependency install | Docker network → snapshot-bound controlled package proxy only | Frozen-lockfile success/failure and bounded summary; raw logs maintainer-only | No arbitrary registry, DNS or proxy override |

All caps are protocol defaults and may be lowered by Task budget. Truncation is explicit (`truncated: true`, original byte count, Artifact reference) rather than silent. Remote model calls are not Sandbox tools: the Adapter owns them on the trusted host and can influence Sandbox only through validated protocol events and Tool Router requests.

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
| Typed producer record | `producer-record.schema.json` | Policy, Adapter/budget, Infrastructure and Evaluator conclusion sources |
| Dependency cache snapshot | `dependency-cache-snapshot.schema.json` | Registry preflight and Sandbox setup |
| Attempt network policy | `network-policy.schema.json` | Docker topology before Agent/Evaluation execution |
| Trusted proxy diagnostic | `proxy-diagnostic-record.schema.json` | Coordinator/proxy-side retry classification only |
| Requester export | `export-manifest.schema.json`, `requester-export-result.schema.json` | Coarse public-code mapping, allowlist, denylist and audit record |
| Data/credential scan | `data-scan-result.schema.json`, `data-scan-coverage-policy.schema.json` | Bundle publish, Artifact finalization and export |

Protocol invariants:

- First Adapter message is `hello` with protocol version, Adapter identity, capabilities, model metadata, and requested tools.
- Every message has `runId`, `attemptId`, monotonic `seq`, timestamp, and bounded payload.
- Coordinator is the only issuer of Tool Call IDs and cancellation/budget decisions.
- Unknown major versions fail preflight; unknown message types within a supported major version fail the Attempt.
- Secrets are redacted before event persistence and never passed into Docker.
- Accepted Adapter events record only redacted provider/model/version/sampling identifiers, availability and bounded token/cost counters; credentials, endpoints and raw sensitive responses are neither protocol data nor Artifacts.

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
- Agent outcome (`not_started|completed|adapter_error|model_error|budget_exhausted|cancelled`) is immutable and Agent-specific. Attempt-level `executionClassification`, `terminationCause` and `terminationPhase=sandbox_starting|agent|evaluation` record later interruption. A startup proxy outage uses `not_started/sandbox_starting`; an Agent-install outage stopped by the Coordinator uses `cancelled/agent`; an Evaluator-install outage preserves the Agent outcome already finalized before `terminationPhase=evaluation` (normally `completed`, but possibly another outcome that lawfully crossed the barrier). All require `executionClassification=infrastructure_error`, `terminationCause=DEPENDENCY_PROXY_UNAVAILABLE` and an infrastructure producer record. Every other Agent outcome routes through `AGENT_STOPPING → WORKSPACE_FROZEN → EVALUATING` when the barrier passes; only an unsafe/unprovable freeze ends the Attempt before evaluation.
- `AGENT_STOPPING → WORKSPACE_FROZEN` requires the phase barrier: Adapter exited, cancellation acknowledged or timed out, all Agent child processes gone, Agent browser process/profile removed, immutable submission snapshot/digest captured, prior per-Attempt network state accounted for, and no hidden bundle present.
- Static preflight validates a supported lockfile, complete controlled-cache snapshot, fixed proxy/DNS settings, network-policy version and data/credential hygiene. Lock/cache/policy failures are `PREFLIGHT_REJECTED`, create no Attempt/Agent sample and never fall back to public registry access. Only the trusted Coordinator/proxy-side `proxy-diagnostic-record` can classify `DEPENDENCY_PROXY_UNAVAILABLE`: it binds Attempt, dependency snapshot, proxy-config hash, bounded observation window and request correlation to an independent trusted health/access observation. Untrusted package-manager output can request but cannot satisfy this diagnostic. A matching startup diagnostic records `not_started/sandbox_starting`; matching Agent/Evaluator install diagnostics stop the phase, record `cancelled/agent` or preserve the Agent outcome already finalized before `terminationPhase=evaluation`, write infrastructure producer evidence, clean container/process/**both** networks, prove absence and may create Attempt 2. Stale/mismatched diagnostics, Sandbox policy violations, client DNS/configuration, package integrity/project-script and local resource failures are never retried.
- Only after `WORKSPACE_FROZEN` may the Coordinator let the host-only Evaluator Host read the hidden bundle and start an isolated evaluator browser runtime with a fresh profile. Evaluation COW commands, app server, Mock API and Browser share a default-deny per-Attempt topology; the app cannot connect back to the host controller. The hidden bundle is never mounted or copied into the Sandbox.
- A retryable Infrastructure Error on Attempt 1 may create Attempt 2 from the original immutable Task inputs only after Docker confirms prior container/process/network absence. Unproven absence is terminal/quarantined. No later retry is legal.
- Agent Failure, Invalid, Budget Exhausted, and deterministic evaluator failure never transition to automatic retry.
- A requester export may run only after `COMPLETED`; export failure leaves the canonical Result and quality outcomes unchanged.

## Layer 5 — Memory & State

### Authoritative state

SQLite holds canonical resolved Run input JSON, indexed identity/version fields, Attempt lifecycle and Agent outcome, Attempt termination phase/cause, transitions, retry/failure metadata, typed producer records, trusted proxy diagnostics, checksum-bound Artifact scan records with worker and coverage-policy version/outcome, canonical final Result JSON/checksum, and the global execution/migration lease. Events are append-only JSONL Artifacts; large payloads are external Artifact references. Root `input.json`, `result.json` and `state.json` are atomically derived copies that SQLite can regenerate.

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
- On mismatch, SQLite wins and regenerates `input.json`, `result.json` or `state.json`; the mismatch is recorded as a recovery event.
- A completed Run is immutable. Comparisons read only completed Results.
- Run inputs, seed, Task Bundle checksum, environment digest, Adapter configuration, lockfile hash, dependency-cache snapshot, network-policy version and export-policy version are immutable across Attempts.
- One DB-backed global execution lease serializes active Attempts across CLI processes; owner UUID, PID start identity and heartbeat make stale takeover transactional. Migrations require an exclusive lease.

### Data/credential scan coverage

- The immutable, versioned coverage policy is resolved with the Run input. A scan record can be `passed` only when it is bound to the target's exact checksum and records full coverage of every surface required by that policy.
- Text and structured artifacts require complete decoding/parsing. Known archives, including Playwright trace ZIP, require recursive member scanning within declared member-count, depth, expanded-size and resource limits. Images require decoded metadata plus readable-text surfaces; other binary types require an approved type-specific handler.
- Complex archive/image/binary handlers run only in a disposable least-privilege worker with read-only content-addressed input, no writable host mount, no host/LAN/Internet, bounded CPU/memory/time/output and bounded IPC verdict. Archives are inspected without host extraction or only beneath a no-follow root; absolute, `..`, symlink, hardlink and device entries are rejected.
- `unsupported`, `partial`, `encrypted`, `corrupt`, `limit_exceeded`, archive-bomb, worker crash/timeout/OOM and handler-fault outcomes fail closed into quarantine. No manifest, canonical Result or requester export can be finalized from such a record.

## Layer 6 — Evaluation & Observation

- Preflight: schema, semantic rules, Docker/image availability, disk space, Task checksum, Suite membership, lockfile/cache snapshot, fixed proxy/DNS policy and Bundle data/credential hygiene.
- Agent phase: protocol validation, heartbeat, budget counters, permission decisions, command exits, browser/tool evidence.
- Phase barrier: process/**both-network** census, hidden-bundle absence, browser-profile removal, immutable submission snapshot/digest and Tool Router closure.
- Evaluator phase: Integrity → Build → Functional → Visual/Responsive → Accessibility → Engineering.
- Evaluator commands use a copy-on-write overlay over the read-only submission snapshot; source digest is verified before/after each command. Host collection uses no-follow/beneath traversal and rejects escaping links and special files.
- Agent and Evaluation Sandbox execution use distinct default-deny networks. The evaluator browser runtime, application server and COW commands can reach only declared in-Run peers and the snapshot-bound proxy; host gateway, LAN, internet, arbitrary DNS and controller backchannels are denied. Redirect, WebSocket, service-worker, DNS-rebinding and same-origin relay attempts use the same policy.
- Aggregation: explicit gate table decides `valid` and `solved`; execution classification is orthogonal to quality outcome; every conclusion closes through a same-Attempt typed producer record and finalized manifest Artifact with exact-checksum full scan-policy coverage; efficiency remains a separate vector.
- Calibration: Gold and Alternative must pass; every declared Mutation must fail with an expected stable code.
- No LLM/VLM Judge in the MVP deterministic path.
- Requester export builds an independent allowlisted public result/manifest after Artifact audience, private-reference closure, denylist and data/credential scans. It maps private codes only to a predeclared coarse public taxonomy and omits private codes/messages/evidence refs; raw hidden Assertion/Trace/DOM/network/screenshot data remains maintainer-only.

Metrics separate Agent quality from platform reliability: Run-level success@k excludes infrastructure retry Attempts; raw and post-retry infrastructure failure rates are reported separately.

## Layer 7 — Constraints & Recovery

| Failure | Local action | Retry rule | Recovery evidence |
|---|---|---|---|
| Adapter protocol/schema error | Cancel Adapter, stop Agent phase | No automatic retry | Last valid seq, invalid payload hash, stderr Artifact |
| Tool timeout/output overflow | Kill tool process, return bounded failure | Agent may react within remaining budget | Tool Call event and full bounded log Artifact |
| Docker/image/startup failure | Clean partial sandbox | One Infrastructure retry | Attempt failure code and cleanup result |
| Dependency lock/cache invalid | Refuse before Agent start | Never; no Agent sample | Stable preflight code and snapshot evidence |
| Trusted matching proxy diagnostic proves startup outage | Record `not_started/sandbox_starting` Infrastructure producer evidence; clean partial sandbox | One Infrastructure retry when transient and prior absence is proven | Coordinator/proxy-side diagnostic, producer record and cleanup evidence |
| Trusted matching proxy diagnostic proves Agent-install outage | Stop Agent phase; record `cancelled/agent` plus Infrastructure producer evidence; clean container/process/**both** networks; never run hidden evaluation | One Infrastructure retry when prior absence is proven | Coordinator/proxy-side diagnostic, producer record, termination cause/phase and cleanup evidence |
| Trusted matching proxy diagnostic proves Evaluator-install outage | Stop Evaluator phase; preserve the already-finalized Agent outcome with `terminationPhase=evaluation` plus Infrastructure producer evidence; clean container/process/**both** networks; never continue hidden evaluation | One Infrastructure retry when prior absence is proven | Coordinator/proxy-side diagnostic, producer record, termination cause/phase and cleanup evidence |
| Project package-manager/install failure, client DNS/configuration, integrity/script or local-resource error | Preserve its normal project/Agent/evaluator failure path | Never automatic retry | Bounded failure Artifact and absent/mismatched proxy diagnostic |
| Agent crash/budget exhaustion | Stop descendants, freeze if safe | No automatic retry | Exit/termination reason and final patch |
| Sandbox network policy violation | Stop active Agent/Evaluation phase; preserve minimal private evidence | Never; Invalid | Stable policy code, destination class and redacted audit evidence |
| Model-provider authentication failure | Stop Adapter setup/Agent phase | Never; terminal Agent Failure with configuration code | Redacted provider/model configuration evidence |
| Transient model-provider unavailable | Stop Adapter setup/Agent phase | One Infrastructure retry when Adapter proves transient | Stable availability code and bounded metadata |
| Phase barrier cleanup fails but prior container/process/network absence is proven | Destroy sandbox; do not begin hidden evaluation | One Infrastructure retry | Daemon-level absence proof and cleanup error |
| Prior sandbox/process/network absence cannot be proven | Quarantine; do not begin hidden evaluation or another Attempt | Never | Process/network census and quarantine record |
| Evaluator crash | Stop remaining evaluators, preserve completed results | No automatic retry in MVP | Evaluator event and stderr Artifact |
| Data/credential scan finding, unsupported/partial/limited coverage, worker fault, or missing/stale scan record | Quarantine staging; do not write final manifest | Never finalize until exact-checksum full coverage from a successful isolated worker under the active policy passes | Scanner/worker/policy version, coverage outcome/surfaces, scanned checksum and finding record |
| SQLite/Artifact/Result partial write | Quarantine staging; recover canonical inputs/Result from SQLite; verify finalized manifest and scan records before COMPLETED | Resume finalization, not Agent execution | Crash-boundary recovery event and checksum/scan diff |
| Coordinator interruption | Acquire global execution lease, inspect last committed transition, clean or resume only idempotent phase | Never replay Agent phase inside an existing Attempt | Lease owner/PID-start/heartbeat and reconciliation log |
| Requester export policy/data scan fails | Keep completed Run and private evidence | Re-run export only after policy cause is resolved | Export audit row and failure code |

Cleanup is idempotent. Run directories are staged under `.tmp/<run-id>/<attempt-id>` and become visible only through atomic rename/finalized manifest. Every candidate Artifact and Result is scanned before manifest creation; its exact checksum, scanner/worker version, coverage-policy version and full required coverage must pass. Canonical Result JSON/checksum is committed in SQLite before derived `result.json`; `COMPLETED` is committed only after the derived file, parent-directory fsync, manifest, scan records and typed producer evidence all verify. Orphan detection uses the global lease; stale leases trigger reconciliation, not blind deletion.

## Day 1 MVP Checklist

- [ ] SQLite canonical input/Result, Run/Attempt tables and global lease plus atomically derived `input.json`/`result.json`/`state.json`, loaded and reconciled at CLI start
- [ ] Retry wrapper only for classified infrastructure startup/cleanup and trusted-proxy-diagnosed dependency-install outages; maximum one new Attempt
- [ ] JSON Schema validation on Task, protocol messages, Tool Calls, typed producer records, evaluator results, manifests, requester export result and final Result
- [ ] Per-tool output caps and Artifact references as defined above
- [ ] Append-only event sequencing with heartbeat, cancellation, max-line size, and redaction
- [ ] Static lockfile/cache-snapshot gate plus post-Attempt startup/Agent/Evaluator trusted-proxy-diagnostic retry paths; no in-Run public registry fallback
- [ ] Default-deny Agent/Evaluation networks, including app-server relay prevention, with controller host-only and proxy-only dependency exception
- [ ] Exact-checksum full-coverage data/credential scan before manifest finalization, including isolated scanner workers for recursive trace/archive, image and approved-binary handling with fail-closed limits, plus independent requester export with coarse public-code mapping and allowlist/denylist/private-reference closure scans
- [ ] Phase-barrier verification, immutable snapshot, OS-enforced writable overlays, no-follow collection and isolated evaluator-browser origin policy before host-only hidden evaluation begins

## Assumptions

- Host, Coordinator, Docker daemon, and registered Adapter code are trusted.
- Model-generated actions and all code executed in Docker are untrusted.
- Docker provides the MVP isolation boundary; hostile multi-tenant workloads are out of scope.
- The model provider may be external, but credentials remain host-side and never enter the Task workspace, persisted raw logs, Artifacts or requester exports.
- The system runs on a maintainer-dedicated or disposable host. Docker, Browser and kernel 0-day resistance is outside the MVP boundary.

## Open Questions

- Exact protocol frame size and heartbeat interval should be measured in the vertical slice; defaults above are upper bounds, not product requirements.
- Whether visual evaluator baselines use raw pixel diff, perceptual metrics, or both remains an evaluator-level reversible choice.

## Non-goals

- Distributed scheduling, remote Adapter services, multi-tenant isolation, microVMs, cloud Artifact storage, public leaderboard, and long-horizon context reset.

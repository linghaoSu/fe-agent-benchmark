# Design Review — Frontend Coding Agent Benchmark

> Status：changes required; modification plan pending approval  
> Date：2026-07-10  
> Target：design  
> Slug：`frontend-agent-benchmark`

## Review Configuration

- `review_intensity`：`deep`
- Selection：auto-selected, not user-forced.
- Reason：the design contains hidden-test/security boundaries, Docker process and network isolation, persistent SQLite/filesystem state, retries, public JSON Schemas/stdio protocol, and an Agent orchestration loop.
- Mode：independent multi-reviewer; no degradation.
- Required axes：Spec, Standards, Correctness/Security, Verification/Implementation Fit.
- UI/UX axis：not applicable; no `interface-design.md` and Dashboard is outside MVP.

## Input Fingerprint — Round 1

```text
ab7850db4a88b959b832c16c49e0f96d16f3d8e8210e2abd8a8c0612339bc8d7  requirements.md
c23b0c60427438cd39da3eb7979a470f82ac462155ef1e86d0b68a84a916e6df  architecture.md
f01cc6adbee262175467467c0fdb8c2d6186de12cf6e816c9781bf4f124e09ae  harness-design.md
```

Fingerprint was checked before reviewer launch and again before this modification plan. Inputs did not drift. No architecture, requirement, diagram, schema, example, or harness edit has been applied in Round 1.

## Independent Review Results

- Spec/Standards reviewer：not LGTM; 1 high, 4 medium, 1 low.
- Correctness/Security reviewer：not LGTM; 6 high, 2 medium.
- Verification/Implementation Fit reviewer：not LGTM; 5 high, 2 medium.
- Coordinator adversarial synthesis：confirmed the independent findings and added one high OS-enforcement gap for Shell writable-path policy.

## Deduplicated Findings

### High — must repair after plan approval

#### DR-001 — Run identity is not durably queryable from SQLite

- Axis：Spec / Correctness.
- Evidence：`requirements.md:74-76` requires all resolved versions, repository commit, Bundle checksum, seed, environment, viewport, budget and retry metadata. `architecture.md:247-258` gives `runs` only `run_id`, `input_hash`, status, requested k and timestamps; the resolved input exists only as `input.json` at `architecture.md:262-281`.
- Consequence：SQLite cannot independently recover or compare the immutable Run identity when the file is absent/corrupt, contradicting D5 and weakening FR-002/FR-013/NFR-005.
- Minimal repair：store canonical `resolved_input_json` plus indexed comparison dimensions in SQLite; define input hash coverage and checksum/reconciliation for the derived root `input.json`.
- Plannotator clarification — when this occurs：
  1. A crash or disk-full event happens after the SQLite Run row commits but before `input.json` is completely fsynced/renamed.
  2. A user or cleanup process removes/corrupts one Run directory while SQLite still marks the Run complete.
  3. `eval compare` needs to filter/group by model, Prompt, Harness, environment or seed. With only `input_hash` in SQLite, it must open every `input.json`; one missing file makes the database unable to answer its own comparison query.
  4. Startup reconciliation needs to decide whether a filesystem copy is correct. A hash without canonical source fields/payload in SQLite cannot reconstruct or independently validate that copy.
  If the filesystem is always intact, the defect is latent; it becomes user-visible specifically during partial writes, cleanup/corruption, comparison at scale, or recovery—the scenarios D5 and NFR-005 require the architecture to survive.

#### DR-002 — Agent outcome is incorrectly terminal before required evaluation

- Axis：Verification / Correctness.
- Evidence：`requirements.md:90-92` requires freeze/evaluation after Agent completion, failure or budget exhaustion when safe. `architecture.md:307-318` allows `AGENT_RUNNING → FAILED`, while the sequence at `architecture.md:354-360` assumes shutdown/freeze/evaluate.
- Consequence：Agent crash/budget/cancel paths can skip patch capture and deterministic evaluation, producing inconsistent and unauditable Results.
- Minimal repair：separate `agentOutcome` from Attempt lifecycle; route complete/error/budget/cancel through stopping, phase barrier, freeze and evaluation whenever cleanup is proven. Only barrier/infrastructure failure can terminate pre-evaluation. Add transition truth-table tests.

#### DR-003 — Evaluator-observed incorrect behavior is conflated with Agent execution failure

- Axis：Correctness / Verification.
- Evidence：`architecture.md:413-418` defines build/functional failures as valid-but-unsolved evaluator outcomes, while `architecture.md:426-433` classifies target behavior failure as `agent_failure`.
- Consequence：identical functional failures can enter different categories, corrupting comparison, success@k and failure analytics.
- Minimal repair：define orthogonal execution classification and quality-gate outcome. Reserve `agent_failure` for Adapter/model execution termination; evaluator-observed failures produce completed evaluation with `valid=true`, `solved=false` and stable evaluator codes. Add a classification truth table.

#### DR-004 — Result conclusions do not require evidence closure

- Axis：Verification / Traceability.
- Evidence：NFR-005 at `requirements.md:175-177` requires every failure, gate and dimension conclusion to cite structured evidence. `architecture.md:237-241` validates only references that happen to exist; `examples/result.json:34-39` contains a failure without evidence.
- Consequence：a Schema-valid Result can contain unsupported conclusions and still pass manifest checks.
- Minimal repair：make non-empty `evidenceRefs` mandatory for every failure, gate and scored conclusion; validate closure from Result → Evaluator Result → finalized same-Attempt manifest entry → checksum-valid Artifact. Add negative fixtures for missing, dangling, wrong-Attempt, unfinalized and checksum-invalid references, and update the example fixture.

#### DR-005 — Fixed-input deterministic repeatability has no explicit verifier

- Axis：Verification.
- Evidence：NFR-002/SC-005 require equal discrete outcomes for identical inputs. V5/V6 at `architecture.md:509-521` mention calibration and pinned environment but no comparator over repeated outputs.
- Consequence：environment pinning can pass while valid/solved, gates or failure codes drift.
- Minimal repair：add a fixed-input/fixed-seed repeat matrix comparing input/environment digests, valid, solved, gate outcomes and ordered stable failure codes, while excluding permitted nondeterministic efficiency fields. Run it for samples in V5 and all published MVP tasks in V6.

#### DR-006 — Retained run-data-flow diagram contradicts the approved security flow

- Axis：Verification / Implementation Fit.
- Evidence：`diagrams/run-data-flow.mmd:16-19` still read-only mounts hidden Evaluator code, and lines 36-40 start evaluation without Adapter shutdown, descendant cleanup, profile deletion or phase barrier. `architecture.md:38-41` already says this flow must be replaced.
- Consequence：the design package has two authoritative-looking flows; following the old diagram violates NFR-001.
- Minimal repair：update the diagram to the host-only hidden Evaluator flow and explicit phase barrier, or mark it non-canonical. The plan chooses an update because it is part of the expected design package.

#### DR-007 — Evaluator browser has an unbounded trusted-host network surface

- Axis：Correctness / Security.
- Evidence：`architecture.md:122-125`, `134-136` and `388` place a fresh evaluator browser beside the trusted host and point it at an untrusted app without an origin/network policy.
- Trigger：submitted JS redirects, fetches, opens WebSockets/service workers, or targets host-loopback/LAN services.
- Consequence：host-local request forgery, hidden behavioral-input exfiltration and nondeterministic external access.
- Minimal repair：keep Playwright controller/assertions host-only, but run the evaluator browser as an untrusted isolated runtime; allow only the assigned app origin, deny host gateway/LAN/external egress, and test redirects, WebSockets, service workers and host-gateway probes.
- Plannotator clarification — concrete problem：the evaluated page is Agent-authored, untrusted JavaScript. If its browser process runs on the trusted host with ordinary networking, that page can initiate requests to `127.0.0.1`, host-only development/admin ports, LAN services or the internet. CORS may prevent reading some responses, but it does not reliably prevent sending state-changing requests, redirects, WebSockets, image/form requests or timing signals. A malicious page can also encode which hidden interaction just occurred into outbound request paths/timing. The risk is therefore not that hidden test source is mounted; it is that hidden test behavior drives an untrusted page inside a browser that can reach trusted-host and external networks. Isolating the browser runtime and allowlisting only the assigned app origin closes that path while the Playwright assertions remain host-only.

#### DR-008 — Evaluation can mutate the frozen submission

- Axis：Correctness / Auditability.
- Evidence：`architecture.md:357-358` captures a patch/checksum, then `architecture.md:361` and `389` execute untrusted install/build/start scripts in that same workspace.
- Consequence：Evaluator may judge code or configuration not represented by the captured Patch; transient mutation can escape Integrity-before-Build.
- Minimal repair：create an immutable submission snapshot/digest and evaluate through a copy-on-write overlay or read-only source mount with explicit writable dependency/build-output paths. Verify the source digest before/after every untrusted evaluator command and record the evaluated snapshot digest in every Evaluator Result and final Result.

#### DR-009 — Host traversal of the untrusted workspace lacks no-follow rules

- Axis：Correctness / Security.
- Evidence：`architecture.md:239` accepts relative Artifact paths and `architecture.md:281`, `357` perform host-side checksum/copy operations, but no contract defines symlink, hardlink, device or FIFO handling.
- Consequence：host file disclosure, traversal outside the Run root, hangs on special files, or checksums over data outside the submission.
- Minimal repair：define a no-follow untrusted-tree traversal contract: canonical containment, component-wise `lstat`, beneath/no-follow opens, rejection of symlink/hardlink escapes and special files, no recursive host traversal with followed links, plus real-Docker adversarial tests.
- Plannotator clarification — why the container alone is insufficient：Agent commands do run in Docker, but the architecture later asks the trusted host Coordinator to capture the Patch/workspace checksum, collect screenshots/logs, build the Artifact manifest and copy/finalize files from the bind-mounted or exported workspace. At that phase the reader is no longer the container process. An Agent can leave `artifact-link -> ../../outside-run`, an absolute symlink such as `/etc/passwd`, a FIFO or a device-like special entry. If a host-side recursive copy/checksum follows it, pathname resolution occurs in the host reader's namespace and may escape the Run root, disclose a host file, or hang finalization. The trigger is phase-barrier snapshotting or Artifact collection—not normal Agent command execution. If implementation guarantees Docker-export-only traversal with equivalent no-follow semantics, that also satisfies the repair; the architecture currently specifies no such guarantee.

#### DR-010 — Shell writable-path policy is not OS-enforced

- Axis：Correctness / Security.
- Evidence：FR-003 at `requirements.md:78-80` requires enforcement of writable/forbidden paths. `architecture.md:190-193` assigns policy to Tool Router, but arbitrary Shell commands in Sandbox can write outside allowed paths and can restore changes before final diff.
- Consequence：the declared permission model is advisory for Shell, allowing verifier/config/toolchain tampering that can evade end-state checks.
- Minimal repair：make the container root and protected workspace read-only; restrict v1 writable patterns to validated directory-prefix mounts/overlays; expose separate runtime-writable paths for temp/dependencies/build outputs; run commands as non-root and add write/revert/rename/hardlink escape tests. Unsupported glob shapes fail Task preflight.

#### DR-011 — Cleanup failure can retry while the prior Sandbox is still alive

- Axis：Correctness / Security / Retry.
- Evidence：`architecture.md:382`, `431`, `438` and `harness-design.md:128` permit Infrastructure retry after phase-barrier cleanup failure without distinguishing proven termination from unknown residual state.
- Consequence：Attempt 2 can overlap an orphaned Attempt 1, making Agent and hidden evaluation effectively concurrent across Attempts.
- Minimal repair：split cleanup outcomes into proven terminated (retryable) and absence unproven (terminal/quarantined). Do not create Attempt 2 until Docker daemon confirms container/process/network absence. Use per-Attempt isolated networks/credentials and test unkillable/orphan cases.

#### DR-012 — SQLite/Artifact/final Result commit protocol is incomplete

- Axis：Correctness / Persistence.
- Evidence：`architecture.md:253-281`, `365` and `440` do not define a crash-safe order for canonical Result JSON, root `result.json`, finalized manifests and `COMPLETED` status across SQLite and filesystem.
- Consequence：SQLite may expose a completed Run with missing/corrupt `result.json`, or filesystem may expose a Result the DB does not recognize.
- Minimal repair：store canonical Result JSON/checksum in SQLite; write/fsync/rename derived root Result; verify all finalized manifests/files; only then transactionally mark `COMPLETED`. Define reconciliation from canonical DB data and inject crashes at every file/DB/parent-directory-fsync boundary.

#### DR-013 — Multiple CLI processes violate the single sequential Worker contract

- Axis：Correctness / Concurrency.
- Evidence：`requirements.md:45-47` requires a single sequential Worker. `architecture.md:63` assumes one Coordinator, but every CLI invocation is a new process; `architecture.md:186`, `439` lack a global executor and migration lease.
- Consequence：two shells/CI jobs can execute Attempts concurrently, race migrations/SQLite locks, collide on resource budgets and invalidate reliability measurements.
- Minimal repair：add a DB-backed global execution lease with owner UUID, PID-start identity, heartbeat and transactional stale-steal rules; hold it across the active Attempt, permit concurrent read-only commands, and use an exclusive migration lock. Test two-process contention, stale leases and PID reuse.

### Medium — record as Known Issues; not in the approved repair set by default

| ID | Axis | Finding | Default disposition / trigger |
|---|---|---|---|
| DR-M01 | Spec | Task Bundle checksum lacks canonical manifest, ordering, symlink/mode and digest rules | Defer; fix before V0 Task publication or if DR-001 input hashing cannot be specified without it |
| DR-M02 | Spec | Approved Roadmap M0 still mentions API while requirements/architecture exclude API service | Defer documentation sync; fix before implementation planning uses Roadmap as stage contract |
| DR-M03 | Standards | Sixteen proposed packages/interfaces over-fragment the greenfield MVP | Defer; start implementation with logical modules and extract only stable seams; trigger if V0 scaffolding dominates vertical behavior |
| DR-M04 | Protocol | No bounded queue, max in-flight Tool Calls or persistence quota for valid small-frame flooding | Defer; fix before V2 protocol conformance is declared complete |
| DR-M05 | Verification | Migration backup test does not prove restoration with prior reader or corrupt-backup refusal | Defer; fix before first nontrivial SQLite migration |
| DR-M06 | Protocol | Bidirectional JSONL uses one ambiguous monotonic sequence space | Defer; fix before Adapter protocol v1 freezes |
| DR-M07 | Security | Stderr redaction lacks a value-aware streaming/secret inventory contract | Defer; fix before real model credentials are used or Artifact finalization ships |

### Low / Nit

| ID | Finding | Disposition |
|---|---|---|
| DR-L01 | Requirements still label five questions open even though D1/D3/D4/D5/D8 resolve them | Record only; architecture already captures D1–D9. Synchronize only if requirements are intentionally refreshed. |

## Modification Plan — approval required

Only the following critical/high repair set is authorized if this plan is approved. No medium/low/nit cleanup is included unless indispensable to a listed high repair.

| Plan ID | High findings | Planned edit | Affected files | Verification after edit |
|---|---|---|---|---|
| MP-01 | DR-001, DR-012, DR-013 | Define canonical SQLite Run input/Result payloads, derived file reconciliation, crash-safe finalization, global execution/migration leases | `architecture.md`, `harness-design.md` | Persistence/concurrency reviewer + crash/lease test contracts |
| MP-02 | DR-002, DR-003 | Split Agent outcome, Attempt lifecycle and quality-gate outcome; repair state diagrams, failure table and truth-table tests | `architecture.md`, `harness-design.md` | Spec and verification reviewers |
| MP-03 | DR-004 | Require evidenceRefs and referential closure; add negative fixtures and update example Result evidence | `architecture.md`, `examples/result.json` | Verification reviewer + schema/evidence-closure checklist |
| MP-04 | DR-005 | Add fixed-input/fixed-seed deterministic comparator to V5/V6 | `architecture.md` | Verification reviewer |
| MP-05 | DR-006 | Replace stale hidden-mount sequence with shutdown, phase barrier, host-only evaluator and safe failure branches | `diagrams/run-data-flow.mmd` | Correctness/security + implementation-fit reviewers |
| MP-06 | DR-007, DR-008, DR-009, DR-010, DR-011 | Specify evaluator-browser network isolation, immutable evaluation snapshot, safe untrusted-tree traversal, OS-enforced writable mounts, and non-retryable unproven cleanup | `architecture.md`, `harness-design.md` | Full correctness/security adversarial re-review |

## Approval Decision

Decision needed：approve or reject MP-01 through MP-06 as the single high-severity repair round.

Recommended：approve. Every planned change addresses a demonstrated security, persistence, classification, traceability, reproducibility or concurrency defect on the primary path. Medium/low findings remain documented and are not opportunistically bundled.

If approved：fingerprint inputs again, apply only MP-01–MP-06, run objective consistency checks, then re-run every independent review angle plus a holistic sanity pass. A new high/critical finding requires a new plan entry and approval.

## Round 1 Verdict

- Required independent axes LGTM：no.
- Remaining critical/high bugs：13 deduplicated high findings.
- Verdict：changes required; do not hand off to TDD or implementation.

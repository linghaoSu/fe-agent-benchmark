# 设计评审 — 前端 Coding Agent 评测系统

> 状态：第二轮发现新的 high；追加修改计划待审批  
> 日期：2026-07-10  
> 目标：架构设计  
> Slug：`frontend-agent-benchmark`

## 评审配置

- `review_intensity`：`deep`
- 选择方式：自动选择，并非用户强制。
- 原因：设计涉及隐藏测试安全边界、Docker 进程与网络隔离、SQLite/文件系统持久状态、重试、公共 JSON Schema/stdio 协议以及 Agent 编排循环。
- 模式：多名 reviewer 独立评审；没有降级。
- 必需评审轴：需求、标准、正确性/安全、验证/实现适配。
- UI/UX 轴：不适用；不存在 `interface-design.md`，Dashboard 也不在 MVP 范围内。

## 输入指纹 — 第一轮

```text
ab7850db4a88b959b832c16c49e0f96d16f3d8e8210e2abd8a8c0612339bc8d7  requirements.md
c23b0c60427438cd39da3eb7979a470f82ac462155ef1e86d0b68a84a916e6df  architecture.md
f01cc6adbee262175467467c0fdb8c2d6186de12cf6e816c9781bf4f124e09ae  harness-design.md
```

启动 reviewer 前以及生成本修改计划前均已检查指纹。输入没有漂移。第一轮尚未修改架构、需求、流程图、Schema、示例或 Harness。

## 独立评审结果

- 需求/标准 reviewer：未通过；1 个 high、4 个 medium、1 个 low。
- 正确性/安全 reviewer：未通过；6 个 high、2 个 medium。
- 验证/实现适配 reviewer：未通过；5 个 high、2 个 medium。
- Coordinator 对抗性综合：确认独立发现，并补充 1 个 Shell 可写路径缺少 OS 级强制的 high 缺陷。

## 去重后的发现

### 高严重度 — 计划批准后必须修复

#### DR-001 — SQLite 无法持久、独立地查询 Run 身份

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

#### DR-002 — Agent 结果会在必需评估之前错误地进入终态

- Axis：Verification / Correctness.
- Evidence：`requirements.md:90-92` requires freeze/evaluation after Agent completion, failure or budget exhaustion when safe. `architecture.md:307-318` allows `AGENT_RUNNING → FAILED`, while the sequence at `architecture.md:354-360` assumes shutdown/freeze/evaluate.
- Consequence：Agent crash/budget/cancel paths can skip patch capture and deterministic evaluation, producing inconsistent and unauditable Results.
- Minimal repair：separate `agentOutcome` from Attempt lifecycle; route complete/error/budget/cancel through stopping, phase barrier, freeze and evaluation whenever cleanup is proven. Only barrier/infrastructure failure can terminate pre-evaluation. Add transition truth-table tests.

#### DR-003 — Evaluator 发现的行为错误与 Agent 执行失败混为一类

- Axis：Correctness / Verification.
- Evidence：`architecture.md:413-418` defines build/functional failures as valid-but-unsolved evaluator outcomes, while `architecture.md:426-433` classifies target behavior failure as `agent_failure`.
- Consequence：identical functional failures can enter different categories, corrupting comparison, success@k and failure analytics.
- Minimal repair：define orthogonal execution classification and quality-gate outcome. Reserve `agent_failure` for Adapter/model execution termination; evaluator-observed failures produce completed evaluation with `valid=true`, `solved=false` and stable evaluator codes. Add a classification truth table.

#### DR-004 — Result 结论没有强制证据闭包

- Axis：Verification / Traceability.
- Evidence：NFR-005 at `requirements.md:175-177` requires every failure, gate and dimension conclusion to cite structured evidence. `architecture.md:237-241` validates only references that happen to exist; `examples/result.json:34-39` contains a failure without evidence.
- Consequence：a Schema-valid Result can contain unsupported conclusions and still pass manifest checks.
- Minimal repair：make non-empty `evidenceRefs` mandatory for every failure, gate and scored conclusion; validate closure from Result → Evaluator Result → finalized same-Attempt manifest entry → checksum-valid Artifact. Add negative fixtures for missing, dangling, wrong-Attempt, unfinalized and checksum-invalid references, and update the example fixture.

#### DR-005 — 固定输入的确定性重复运行缺少显式验证器

- Axis：Verification.
- Evidence：NFR-002/SC-005 require equal discrete outcomes for identical inputs. V5/V6 at `architecture.md:509-521` mention calibration and pinned environment but no comparator over repeated outputs.
- Consequence：environment pinning can pass while valid/solved, gates or failure codes drift.
- Minimal repair：add a fixed-input/fixed-seed repeat matrix comparing input/environment digests, valid, solved, gate outcomes and ordered stable failure codes, while excluding permitted nondeterministic efficiency fields. Run it for samples in V5 and all published MVP tasks in V6.

#### DR-006 — 保留的运行数据流图与已批准安全流程矛盾

- Axis：Verification / Implementation Fit.
- Evidence：`diagrams/run-data-flow.mmd:16-19` still read-only mounts hidden Evaluator code, and lines 36-40 start evaluation without Adapter shutdown, descendant cleanup, profile deletion or phase barrier. `architecture.md:38-41` already says this flow must be replaced.
- Consequence：the design package has two authoritative-looking flows; following the old diagram violates NFR-001.
- Minimal repair：update the diagram to the host-only hidden Evaluator flow and explicit phase barrier, or mark it non-canonical. The plan chooses an update because it is part of the expected design package.

#### DR-007 — Evaluator Browser 暴露了不受限制的可信宿主网络面

- Axis：Correctness / Security.
- Evidence：`architecture.md:122-125`, `134-136` and `388` place a fresh evaluator browser beside the trusted host and point it at an untrusted app without an origin/network policy.
- Trigger：submitted JS redirects, fetches, opens WebSockets/service workers, or targets host-loopback/LAN services.
- Consequence：host-local request forgery, hidden behavioral-input exfiltration and nondeterministic external access.
- Minimal repair：keep Playwright controller/assertions host-only, but run the evaluator browser as an untrusted isolated runtime; allow only the assigned app origin, deny host gateway/LAN/external egress, and test redirects, WebSockets, service workers and host-gateway probes.
- Plannotator clarification — concrete problem：the evaluated page is Agent-authored, untrusted JavaScript. If its browser process runs on the trusted host with ordinary networking, that page can initiate requests to `127.0.0.1`, host-only development/admin ports, LAN services or the internet. CORS may prevent reading some responses, but it does not reliably prevent sending state-changing requests, redirects, WebSockets, image/form requests or timing signals. A malicious page can also encode which hidden interaction just occurred into outbound request paths/timing. The risk is therefore not that hidden test source is mounted; it is that hidden test behavior drives an untrusted page inside a browser that can reach trusted-host and external networks. Isolating the browser runtime and allowlisting only the assigned app origin closes that path while the Playwright assertions remain host-only.

#### DR-008 — 评估阶段仍可修改已冻结提交

- Axis：Correctness / Auditability.
- Evidence：`architecture.md:357-358` captures a patch/checksum, then `architecture.md:361` and `389` execute untrusted install/build/start scripts in that same workspace.
- Consequence：Evaluator may judge code or configuration not represented by the captured Patch; transient mutation can escape Integrity-before-Build.
- Minimal repair：create an immutable submission snapshot/digest and evaluate through a copy-on-write overlay or read-only source mount with explicit writable dependency/build-output paths. Verify the source digest before/after every untrusted evaluator command and record the evaluated snapshot digest in every Evaluator Result and final Result.

#### DR-009 — 宿主遍历不可信工作区时缺少禁止跟随链接规则

- Axis：Correctness / Security.
- Evidence：`architecture.md:239` accepts relative Artifact paths and `architecture.md:281`, `357` perform host-side checksum/copy operations, but no contract defines symlink, hardlink, device or FIFO handling.
- Consequence：host file disclosure, traversal outside the Run root, hangs on special files, or checksums over data outside the submission.
- Minimal repair：define a no-follow untrusted-tree traversal contract: canonical containment, component-wise `lstat`, beneath/no-follow opens, rejection of symlink/hardlink escapes and special files, no recursive host traversal with followed links, plus real-Docker adversarial tests.
- Plannotator clarification — why the container alone is insufficient：Agent commands do run in Docker, but the architecture later asks the trusted host Coordinator to capture the Patch/workspace checksum, collect screenshots/logs, build the Artifact manifest and copy/finalize files from the bind-mounted or exported workspace. At that phase the reader is no longer the container process. An Agent can leave `artifact-link -> ../../outside-run`, an absolute symlink such as `/etc/passwd`, a FIFO or a device-like special entry. If a host-side recursive copy/checksum follows it, pathname resolution occurs in the host reader's namespace and may escape the Run root, disclose a host file, or hang finalization. The trigger is phase-barrier snapshotting or Artifact collection—not normal Agent command execution. If implementation guarantees Docker-export-only traversal with equivalent no-follow semantics, that also satisfies the repair; the architecture currently specifies no such guarantee.

#### DR-010 — Shell 可写路径策略没有由操作系统强制

- Axis：Correctness / Security.
- Evidence：FR-003 at `requirements.md:78-80` requires enforcement of writable/forbidden paths. `architecture.md:190-193` assigns policy to Tool Router, but arbitrary Shell commands in Sandbox can write outside allowed paths and can restore changes before final diff.
- Consequence：the declared permission model is advisory for Shell, allowing verifier/config/toolchain tampering that can evade end-state checks.
- Minimal repair：make the container root and protected workspace read-only; restrict v1 writable patterns to validated directory-prefix mounts/overlays; expose separate runtime-writable paths for temp/dependencies/build outputs; run commands as non-root and add write/revert/rename/hardlink escape tests. Unsupported glob shapes fail Task preflight.

#### DR-011 — 清理失败后可能在旧 Sandbox 仍存活时重试

- Axis：Correctness / Security / Retry.
- Evidence：`architecture.md:382`, `431`, `438` and `harness-design.md:128` permit Infrastructure retry after phase-barrier cleanup failure without distinguishing proven termination from unknown residual state.
- Consequence：Attempt 2 can overlap an orphaned Attempt 1, making Agent and hidden evaluation effectively concurrent across Attempts.
- Minimal repair：split cleanup outcomes into proven terminated (retryable) and absence unproven (terminal/quarantined). Do not create Attempt 2 until Docker daemon confirms container/process/network absence. Use per-Attempt isolated networks/credentials and test unkillable/orphan cases.

#### DR-012 — SQLite、Artifact 与最终 Result 的提交协议不完整

- Axis：Correctness / Persistence.
- Evidence：`architecture.md:253-281`, `365` and `440` do not define a crash-safe order for canonical Result JSON, root `result.json`, finalized manifests and `COMPLETED` status across SQLite and filesystem.
- Consequence：SQLite may expose a completed Run with missing/corrupt `result.json`, or filesystem may expose a Result the DB does not recognize.
- Minimal repair：store canonical Result JSON/checksum in SQLite; write/fsync/rename derived root Result; verify all finalized manifests/files; only then transactionally mark `COMPLETED`. Define reconciliation from canonical DB data and inject crashes at every file/DB/parent-directory-fsync boundary.

#### DR-013 — 多个 CLI 进程会违反单顺序 Worker 契约

- Axis：Correctness / Concurrency.
- Evidence：`requirements.md:45-47` requires a single sequential Worker. `architecture.md:63` assumes one Coordinator, but every CLI invocation is a new process; `architecture.md:186`, `439` lack a global executor and migration lease.
- Consequence：two shells/CI jobs can execute Attempts concurrently, race migrations/SQLite locks, collide on resource budgets and invalidate reliability measurements.
- Minimal repair：add a DB-backed global execution lease with owner UUID, PID-start identity, heartbeat and transactional stale-steal rules; hold it across the active Attempt, permit concurrent read-only commands, and use an exclusive migration lock. Test two-process contention, stale leases and PID reuse.

### 中严重度 — 记录为已知问题；默认不进入批准修复集

| ID | Axis | Finding | Default disposition / trigger |
|---|---|---|---|
| DR-M01 | Spec | Task Bundle checksum lacks canonical manifest, ordering, symlink/mode and digest rules | Defer; fix before V0 Task publication or if DR-001 input hashing cannot be specified without it |
| DR-M02 | Spec | Approved Roadmap M0 still mentions API while requirements/architecture exclude API service | Defer documentation sync; fix before implementation planning uses Roadmap as stage contract |
| DR-M03 | Standards | Sixteen proposed packages/interfaces over-fragment the greenfield MVP | Defer; start implementation with logical modules and extract only stable seams; trigger if V0 scaffolding dominates vertical behavior |
| DR-M04 | Protocol | No bounded queue, max in-flight Tool Calls or persistence quota for valid small-frame flooding | Defer; fix before V2 protocol conformance is declared complete |
| DR-M05 | Verification | Migration backup test does not prove restoration with prior reader or corrupt-backup refusal | Defer; fix before first nontrivial SQLite migration |
| DR-M06 | Protocol | Bidirectional JSONL uses one ambiguous monotonic sequence space | Defer; fix before Adapter protocol v1 freezes |
| DR-M07 | Security | Stderr redaction lacks a value-aware streaming/secret inventory contract | Defer; fix before real model credentials are used or Artifact finalization ships |

### 低严重度 / 细节

| ID | Finding | Disposition |
|---|---|---|
| DR-L01 | Requirements still label five questions open even though D1/D3/D4/D5/D8 resolve them | Record only; architecture already captures D1–D9. Synchronize only if requirements are intentionally refreshed. |

## 修改计划 — 需要审批

如果本计划获批，只授权以下 critical/high 修复集。除非是完成某个 high 修复不可缺少的步骤，否则不包含 medium/low/nit 清理。

| Plan ID | High findings | Planned edit | Affected files | Verification after edit |
|---|---|---|---|---|
| MP-01 | DR-001, DR-012, DR-013 | Define canonical SQLite Run input/Result payloads, derived file reconciliation, crash-safe finalization, global execution/migration leases | `architecture.md`, `harness-design.md` | Persistence/concurrency reviewer + crash/lease test contracts |
| MP-02 | DR-002, DR-003 | Split Agent outcome, Attempt lifecycle and quality-gate outcome; repair state diagrams, failure table and truth-table tests | `architecture.md`, `harness-design.md` | Spec and verification reviewers |
| MP-03 | DR-004 | Require evidenceRefs and referential closure; add negative fixtures and update example Result evidence | `architecture.md`, `examples/result.json` | Verification reviewer + schema/evidence-closure checklist |
| MP-04 | DR-005 | Add fixed-input/fixed-seed deterministic comparator to V5/V6 | `architecture.md` | Verification reviewer |
| MP-05 | DR-006 | Replace stale hidden-mount sequence with shutdown, phase barrier, host-only evaluator and safe failure branches | `diagrams/run-data-flow.mmd` | Correctness/security + implementation-fit reviewers |
| MP-06 | DR-007, DR-008, DR-009, DR-010, DR-011 | Specify evaluator-browser network isolation, immutable evaluation snapshot, safe untrusted-tree traversal, OS-enforced writable mounts, and non-retryable unproven cleanup | `architecture.md`, `harness-design.md` | Full correctness/security adversarial re-review |

## 审批决定

需要决定：是否批准 MP-01 至 MP-06，作为唯一一轮高严重度修复。

建议：批准。每项修改都针对主路径上已有证据的安全、持久化、分类、可追踪性、可复现性或并发缺陷。Medium/low 发现继续保留记录，不会顺带打包修复。

批准后：再次计算输入指纹，只应用 MP-01–MP-06，执行客观一致性检查，然后重新运行全部独立评审轴和整体 sanity review。任何新的 high/critical 发现都需要新增计划项并重新审批。

### 修改计划审批记录

- 日期：2026-07-13
- 决定：批准 MP-01 至 MP-06。
- 来源：Plannotator 人工审批。
- 批准范围：仅 13 个 high 发现的六组修复；不包含 DR-M01–DR-M07 或 DR-L01。

## 第一轮结论

- 必需独立评审轴全部通过：否。
- 剩余 critical/high 缺陷：13 个去重后的 high 发现。
- 结论：需要修改；不得交给 TDD 或实现阶段。

## 批准修复的应用记录

| 计划 | 状态 | 已应用内容 |
|---|---|---|
| MP-01 | 已应用 | SQLite canonical Run input/Result、派生文件恢复、可恢复提交顺序、全局执行/迁移租约 |
| MP-02 | 已应用 | Agent outcome 与 Attempt lifecycle/quality outcome 分离，修正状态图与失败分类 |
| MP-03 | 已应用 | 强制 `evidenceRefs` 及同 Attempt 证据闭包，更新 Result 示例和负向验证契约 |
| MP-04 | 已应用 | V5/V6 固定输入、环境和 seed 的确定性比较矩阵 |
| MP-05 | 已应用 | 重写 `run-data-flow.mmd`，移除隐藏挂载并加入 shutdown/phase barrier/host-only evaluator |
| MP-06 | 已应用 | Browser 网络隔离、不可变评估快照、no-follow 遍历、OS 级可写挂载、旧 Attempt 缺席证明 |

未应用 DR-M01–DR-M07 或 DR-L01 的独立清理。

### 客观检查

- `examples/result.json` 通过 `jq` 语法检查。
- 旧流程图中的隐藏 Evaluator 只读挂载已移除。
- Attempt 状态图不再存在 `AGENT_RUNNING → FAILED` 直接终止路径。
- 架构/Harness 均包含 canonical resolved input/Result、全局租约、证据闭包、不可变快照、no-follow、隔离 Browser 和不可重试的未证明清理状态。

## 输入指纹 — 第二轮

```text
ab7850db4a88b959b832c16c49e0f96d16f3d8e8210e2abd8a8c0612339bc8d7  requirements.md
025c243aebaa0e64781c467e752fd70ff2fc05fa751f7a9c5cfaefad74dd2908  architecture.md
f05cf9572e3780d173f3efcf68be4fde082744febff65543f6d79f2e7254aac8  harness-design.md
30008b371d688775e8efb258bf38a870feece77238770bd402490e5037393441  run-data-flow.mmd
a1ef6c1c42e780c1b7e63ce667df5a062860bd12789962ba3b3ce88ae9465364  examples/result.json
```

第二轮必须重新运行需求/标准、正确性/安全、验证/实现适配三个独立评审轴，并执行 Coordinator 整体 sanity review。

## 第二轮独立评审结果

- 验证/实现适配：LGTM；DR-002–DR-006 与持久化/证据修复均已闭环。
- 需求/标准：未通过；1 个 high，来自系统上下文图与正文安全契约不一致。
- 正确性/安全：未通过；1 个 high，来自被测应用服务器可绕过 Browser 限制转发隐藏行为信号。
- 第一轮 DR-001–DR-013 除 DR-007 的边界补全外均确认解决。
- 已知 DR-M01–DR-M07、DR-L01 维持原记录，没有升级。

### DR-014 — 系统上下文图仍把 Evaluator Browser 表示在可信宿主侧

- 严重度：high。
- 评审轴：需求 / 标准 / 安全边界一致性。
- 证据：`architecture.md` 第 5 节图中 `EH --> EB[Fresh Evaluator Browser profile]` 把 Browser 画成宿主 Evaluator 旁的普通组件；紧随其后的信任边界也没有把 Evaluator Browser runtime 列入不可信隔离区。第 12 节却要求其位于 per-Attempt 隔离网络且只允许目标 origin。
- 后果：实现者可以按总览图合法地启动宿主网络 Browser，重新打开 DR-007 的宿主/LAN/外网访问路径。
- 最小修复：更新系统上下文图和信任边界文字，把 Browser runtime 放入 per-Attempt 不可信隔离网络，只连接目标应用 origin/proxy；宿主仅保留 Playwright controller/assertions。

### DR-015 — 被测应用服务器可绕过 Browser 网络限制转发隐藏行为信号

- 严重度：high。
- 评审轴：正确性 / 安全。
- 证据：`architecture.md` 第 12 节限制 Evaluator Browser 只能访问目标 origin，但 install/build/start 和被测应用服务器仍在 Sandbox 中执行，没有明确的 Evaluation 阶段默认拒绝出网规则。
- 攻击链：页面观察隐藏 Playwright 交互 → 通过允许的同源请求发送给被测应用服务器 → 服务器再连接宿主网关、LAN 或外部端点。
- 后果：隐藏行为信号外泄、从被测服务器发起的宿主/LAN 请求、以及外部依赖导致的非确定性；Browser origin allowlist 被完整绕过。
- 最小修复：整个 Evaluation 执行网络（COW 命令、应用服务器、Evaluator Browser）使用 per-Attempt 默认拒绝网络；只允许显式 controller/proxy/app 通道，应用不得连接可信 Playwright controller。V3 增加同源 relay 攻击夹具，验证转发宿主网关/LAN/外部端点全部失败。

## 追加修改计划 — 需要审批

| 计划 | High 发现 | 计划修改 | 文件 | 修复后验证 |
|---|---|---|---|---|
| MP-07 | DR-014 | 修正系统上下文图与信任边界，将 Evaluator Browser runtime 放入不可信 per-Attempt 隔离网络，宿主只保留 controller/assertions | `architecture.md` | 需求/标准与安全 reviewer |
| MP-08 | DR-015 | 对整个 Evaluation 执行网络实施默认拒绝，只放行 controller/proxy/app 必需通道，并增加同源 relay 攻击验证 | `architecture.md`, `harness-design.md` | 完整正确性/安全对抗复审 |

### 追加计划审批

- 需要决定：批准或拒绝 MP-07 与 MP-08。
- 建议：批准。两项都是 MP-06 安全边界的必要闭合，不扩展产品范围，也不包含 medium/low 清理。
- 批准后：记录新指纹，只应用 MP-07/MP-08，再重新运行三个完整独立评审轴和整体 sanity review。

### 追加计划审批结果

- 日期：2026-07-13
- 来源：Plannotator 人工反馈。
- 决定：拒绝修复 MP-07/MP-08，要求将 DR-014/DR-015 记录为已知问题。
- 处理：未修改架构。该延期请求不能按当前评审契约接受，因为 DR-014/DR-015 是主评估路径上的安全边界缺陷，而不是极端边缘场景；它们允许宿主/LAN/外网访问或隐藏行为信号转发。Known Issue 规则禁止延期 security exposure 以及影响主路径的 high。
- 当前结论：`needs_user`。可选方向只有：
  1. 批准 MP-07/MP-08 并继续 deep 修复复审；或
  2. 返回需求阶段，明确改变“不可信被测代码”和隐藏评估/宿主网络保护的威胁模型，再按新需求重新做架构与评审。

### 用户方向选择

- 日期：2026-07-13
- 选择：方向 2——返回需求阶段，缩小威胁模型，不实施 MP-07/MP-08。
- 影响：当前 `requirements.md`、`architecture.md` 和评审结论尚未同步新边界；设计评审保持未通过，不得进入 TDD/实现。
- 下一步：运行 `$idea-to-ship:grill --slug frontend-agent-benchmark`，逐项明确 Evaluation 阶段网络、恶意被测代码、隐藏行为保密和宿主/LAN 保护的新边界；确认后再同步需求并重新架构/评审。

## 第三轮重新基线 — 待 deep 复审

- 日期：2026-07-13
- 输入变化：用户已批准 R1–R9；`requirements.md`、`architecture.md` 与 `harness-design.md` 已同步为受控网络、依赖缓存、隐藏行为保护、Artifact 受众/导出、数据卫生与宿主 Adapter 模型控制平面设计。
- DR-014/DR-015 的历史结论只针对第二轮的旧输入。新 canonical 架构将 Evaluator Browser、应用服务器与 COW 命令明确放入同一 per-Attempt 默认拒绝网络，并新增同源 relay 夹具；这不是“已清洁”结论。
- 当前状态：旧 deep review 不得作为 implementation 入口；必须针对新输入重新运行全部独立评审轴和整体 sanity review。
- 重新基线输入指纹：

  ```text
  2210f23166cba21c273760a4b77a7f85f0439607c0a2fafd2653863d09fba47b  requirements.md
  673baa15404fca29f3e6eebb5a5c4d32ed5d460b591dcda45184c381ec2a28c0  architecture.md
  64046623d16edd1cf701c0bc3a091cc3a7b16c562831c45783949928f9387811  harness-design.md
  7fff2a3a40970d85d486d6053f9f6f76f00fb93fdbeed02b3c88b8731620be98  architecture.revision.md
  b00943acfe44fbc44114baf498808f713068be67e4049bf98d14e0ecbce0e0b0  diagrams/architecture.mmd
  9694ff5bc051d7eb2723d9c48b07a8f445f7bb665a7f4ed4d042c4d1aa17b827  diagrams/run-data-flow.mmd
  ```
- 下一步：`$idea-to-ship:review --target design --review-depth deep --slug frontend-agent-benchmark`。

## 第四轮 Deep 设计评审 — 发现与修复计划

### 评审元数据

- 日期：2026-07-13。
- 目标：`design`；强制强度：`deep`（用户指定；安全、凭据、持久化、网络、公共 Schema 与 Agent Harness 也独立满足 deep 条件）。
- 执行模式：三个独立 reviewer 轴，无降级；Spec/Standards、Correctness/Security、Verification/Implementation Fit。未发现 `interface-design.md` 或 MVP UI 变更，因此 UI/UX 轴不适用。
- 本轮不修改架构、Harness、需求或图表；以下计划获批前，所有 high 保持未修复。
- 输入指纹：

  ```text
  2210f23166cba21c273760a4b77a7f85f0439607c0a2fafd2653863d09fba47b  requirements.md
  673baa15404fca29f3e6eebb5a5c4d32ed5d460b591dcda45184c381ec2a28c0  architecture.md
  7fff2a3a40970d85d486d6053f9f6f76f00fb93fdbeed02b3c88b8731620be98  architecture.revision.md
  64046623d16edd1cf701c0bc3a091cc3a7b16c562831c45783949928f9387811  harness-design.md
  b00943acfe44fbc44114baf498808f713068be67e4049bf98d14e0ecbce0e0b0  architecture.mmd
  9694ff5bc051d7eb2723d9c48b07a8f445f7bb665a7f4ed4d042c4d1aa17b827  run-data-flow.mmd
  56e360f80a92917a22620a57e418a724aef3558e7f46b4645a5b587a39dd3ae8  scoring-flow.mmd
  0d5cb42d770d06b02cbfaefe2867b26928bf7fec881bcce05dc75538caa7c3fb  dataset-validation.mmd
  a1ef6c1c42e780c1b7e63ce667df5a062860bd12789962ba3b3ce88ae9465364  examples/result.json
  f8a72abf489a3f83739e983b6683ad6b383b215c465b5eebf3aa751981e29de7  task.schema.json
  8e1c1030a074b502f93bb21cfa036d3cf7e9fb2693bf899a8f4066eb3b4c0321  result.schema.json
  ```

### 独立轴结论

| Axis | Verdict | Current material result |
|---|---|---|
| Spec / Standards | Not LGTM | DR-016、DR-020，及导出图表的 medium 不一致 |
| Correctness / Security | Not LGTM | DR-016、DR-017 |
| Verification / Implementation Fit | Not LGTM | DR-018、DR-019 |
| Coordinator holistic pass | Not LGTM | DR-021 文档控制风险与上述 high 共同阻断实现入口 |

### High findings

#### DR-016 — 受控包代理故障没有合法的 Attempt 与重试路径

- Severity：high。
- Axes：Spec / Standards；Correctness / Failure recovery。
- Evidence：静态 lock/cache 预检被定义为 Attempt 前拒绝，但 `DEPENDENCY_PROXY_UNAVAILABLE` 被同时定义为可重试 Infrastructure Error；Run 状态机只允许在 `ATTEMPT_ACTIVE` 内创建 Attempt 2。FR-015 要求每一次自动 Infrastructure retry 都保留独立 Attempt 与首次证据。
- Consequence：代理瞬时不可用会出现无 Attempt 的隐式重试、违反状态机，或放弃必须的重试/可靠性统计三种错误实现之一。
- Minimal repair：静态锁文件/缓存快照校验继续保持 Attempt 前终止；将运行时代理健康或访问检查移到 Attempt 1 已创建的 `SANDBOX_STARTING`，以常规清理、缺席证明与 Attempt 2 路径处理瞬时失败。Agent 从未启动时仍不计入 Agent 能力样本。

#### DR-017 — 请求者导出的稳定失败码可成为隐藏断言 oracle

- Severity：high。
- Axis：Correctness / Security / Confidentiality。
- Evidence：NFR-001/NFR-009 禁止请求者获得或反推隐藏行为，但 FR-011 与 architecture 的 requester export 允许稳定失败码；例如 `FOCUS_NOT_RESTORED` 会直接公开触发的隐藏断言类别。
- Consequence：请求者可以通过单次或自适应重复 Run 推断隐藏路由、交互、断言或时序；Artifact 过滤本身无法关闭该信息通道。
- Minimal repair：分离私有 evaluator code 与预先声明、粗粒度且不依赖隐藏行为的 public export code；导出删除私有码、消息和私有 evidence refs，并以差分非干扰夹具验证仅私有断言细节变化时导出不泄露额外信息。

#### DR-018 — 前评估终止结果不能满足当前强制证据闭包

- Severity：high。
- Axis：Verification / Public contracts。
- Evidence：架构要求每个结论经 `Result → Evaluator Result → Artifact` 闭合，但网络策略违规、Adapter/model 失败、预算耗尽和早期 Infrastructure Error 会在 Evaluator 启动前结束。
- Consequence：这些必须可审计的终止 Result 要么伪造 Evaluator Result、要么违反证据闭包、要么无法完成最终化。
- Minimal repair：把闭包泛化为 `Result → typed producer record → same-Attempt finalized Artifact → checksum`，并定义 policy、Adapter/budget、infrastructure producer records（或等价 system-evaluator record）及每类终止路径的夹具。

#### DR-019 — 数据/凭据扫描没有进入 Artifact 最终化的原子提交路径

- Severity：high。
- Axis：Verification / Artifact persistence / Security。
- Evidence：NFR-010 和安全章节要求 Artifact finalization 前扫描，但可恢复提交协议在 `manifest.json`、rename、SQLite Result 与 `COMPLETED` 之间没有 checksum-bound scan gate；V1/V4 也没有覆盖私有 Artifact 扫描拒绝。
- Consequence：含凭据或生产数据的日志、Trace、截图或 Result 可能已进入 maintainer-only finalized storage；之后拒绝请求者导出并不能补救。
- Minimal repair：对每个 staging Artifact 在 manifest finalization 前执行与 checksum 绑定的扫描，记录 scanner version/coverage/status；命中时 quarantine，reconciliation 拒绝缺失、过期或 checksum 不符的 scan record，并加入 text/binary、崩溃和 post-scan mutation 夹具。

#### DR-020 — 评分图把 Performance 置于 MVP 的 Quality/Solved 因果路径

- Severity：high。
- Axis：Spec / Standards。
- Evidence：需求明确 Performance 在 MVP 只可作为原始指标，不能成为 solved 门槛；canonical pipeline 同样不以 Performance 作为 gate。当前 `diagrams/scoring-flow.mmd` 却将 `Performance → Quality → SOLVED`，`dataset-validation.mmd` 也将它呈现为未标记的 MVP Evaluator。
- Consequence：实现者可按图将 Performance 纳入 solved/质量评分，产生与 Result 契约不兼容的结果。
- Minimal repair：将 Performance 移到可选、非 gating 的原始诊断指标，只进入 Report；数据集图相应标为 post-MVP 或 optional/non-gating。

#### DR-021 — 资料包缺少 canonical 文档控制，遗留任务指令可重新引入已修复的安全缺陷

- Severity：high。
- Axis：Coordinator holistic / Spec safety。
- Evidence：README 的建议阅读顺序把 `PLAN.md`、`CODEX_TASK.md` 放在正式架构之前；后者仍指示 MVP “隐藏 evaluator 只读挂载”，并要求 API、Dashboard 等已排除范围。
- Consequence：后续实现者按资料包的显式任务指令即可重新引入隐藏数据暴露或超出已批准 MVP 的系统边界。
- Minimal repair：在 README 建立 requirements/architecture/Harness 的 authoritative order，并在 `PLAN.md`、`CODEX_TASK.md` 写入显著的历史输入/不得作为实现规格说明；保留原始资料供追溯，不删除历史内容。

### Medium / low record

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| DR-M08 | medium | 架构图/运行流程把 optional requester export 画成无条件成功，未展示 `EXPORT_POLICY_DENIED` | 作为完成 DR-017 所必需的导出契约/图表修改并入 MP-10 |
| DR-L02 | low | `architecture.revision.md` 第 2 节称 “R1–R8”，表中实际有 R1–R9 | 记录；不在 high 修复中顺带编辑 |
| DR-L03 | low | architecture V1 Observable behavior 有重复句 | 记录；不在 high 修复中顺带编辑 |

## 第四轮修改计划 — 需要审批

本计划只覆盖下列 high 及完成 DR-017 必须的 DR-M08 图表分支；不包含此前已知的 medium/low 清理。

| Plan ID | Findings | Planned edit | Affected artifacts | Verification after edit |
|---|---|---|---|---|
| MP-09 | DR-016 | 明确 static preflight 与 Attempt 内 runtime proxy check 的边界；为 `SANDBOX_STARTING` 的 `DEPENDENCY_PROXY_UNAVAILABLE` 定义 Attempt 1 证据、清理/缺席证明、Attempt 2；保持静态 lock/cache miss 无 Attempt 且无 Agent 样本 | `architecture.md`, `harness-design.md`, `run-data-flow.mmd` | 静态 miss、启动前 proxy outage、安装中 outage、Attempt 2/无 Agent 样本与可靠性统计真值表 |
| MP-10 | DR-017, DR-M08 | 定义 private evaluator code → coarse public export-code mapping、独立 redacted export Result/manifest、无私有 evidence refs/messages；在架构/流程图中加入 export pass/deny 分支与审计保留 | `requirements.md`, `architecture.md`, `harness-design.md`, `architecture.mmd`, `run-data-flow.mmd` | 差分非干扰、allowlist/denylist、私有码/路径/refs 删除、pass/deny 均写 audit 且 Run 保持 COMPLETED |
| MP-11 | DR-018 | 将 evidence closure 改为 typed producer record；定义 evaluator、policy、Adapter/budget、infrastructure producer kind 与 Artifact/checksum 关系，不允许伪造 evaluator；补齐状态/数据与垂直验证描述 | `architecture.md`, `harness-design.md` | 每个前评估终止类别都可带 non-empty 同 Attempt、checksum-valid evidence 完成最终化；不运行 hidden evaluator |
| MP-12 | DR-019 | 将数据/凭据扫描插入 staging → final manifest 的可恢复原子协议；scan record 绑定 artifact checksum/coverage/scanner version，reconciliation 验证，发现即 quarantine | `architecture.md`, `harness-design.md` | text/binary secret fixtures、post-scan mutation、crash/restart、缺失/过期 scan record 均阻断 finalization/COMPLETED |
| MP-13 | DR-020 | 将 Performance 从 MVP Quality/Solved 路径移到 optional raw diagnostic/report；在数据集图中标注 post-MVP 或 non-gating | `diagrams/scoring-flow.mmd`, `diagrams/dataset-validation.mmd` | Mermaid source check；Performance 指标不影响 valid/solved 的 traceability check |
| MP-14 | DR-021 | 建立 authoritative 文档次序，显著标记 `PLAN.md`/ `CODEX_TASK.md` 为历史概念输入且不得覆盖已批准 requirements/architecture/Harness | `README.md`, `PLAN.md`, `CODEX_TASK.md` | 文档一致性检查确认旧的 hidden-mount/API/Dashboard 指令不能作为实施依据 |

### 审批决定

需要决定：是否批准 MP-09 至 MP-14，作为本轮唯一的 critical/high 修复集。

建议：批准。该集合只闭合已批准主路径的状态、机密性、证据、数据卫生、评分语义和文档控制缺陷；不扩大 MVP 功能范围，也不实现生产代码。

批准后：重新计算当前输入指纹，只应用 MP-09 至 MP-14，运行客观检查，然后重跑 Spec/Standards、Correctness/Security、Verification/Implementation Fit 与整体 sanity review。新的 high/critical 将写入本计划并再次走审批。

### 第四轮修改计划审批记录

- 日期：2026-07-13。
- 决定：批准 MP-09 至 MP-14。
- 来源：Plannotator 人工审批。
- 批准范围：仅 DR-016 至 DR-021，以及完成 DR-017 所必需的 DR-M08 导出图表分支；不包含既有 medium/low 清理。

## 第四轮修复复审 — 新发现与追加计划

### 复审元数据

- 日期：2026-07-13。
- 强度：`deep`；三个独立 reviewer 轴重新读取 MP-09 至 MP-14 修复后的 canonical 输入，无降级。UI/UX 轴不适用（没有 `interface-design.md`，本轮无 MVP UI 变更）。
- 复审输入指纹：

  ```text
  ae871455f6948f5ed85468534270e33c534594555090f51fdb2cbfc8f958bc6d  requirements.md
  42987b903c00562043efe16a40ed4fb757bae5fbb959aa8cce1ad3426e42b468  architecture.md
  7fff2a3a40970d85d486d6053f9f6f76f00fb93fdbeed02b3c88b8731620be98  architecture.revision.md
  ff9914cd18e3176b5f053e752f4a212e7eb495c5ba068dbfcefaceef5f430eab  harness-design.md
  76542f2a3896d82bcadf41af8acba0b3dbed590f1e7b47b6f07a06092084ee3e  architecture.mmd
  232af526771353a275a069d57f280a6fdc0a6d423f40a03e4199441fd1c4e35b  run-data-flow.mmd
  13b73177539678080c246032a03216fe615dc7a15828aaeb26ca8b958aefabdd  scoring-flow.mmd
  8a3b94723a3014b48581444e15a41ef363002bea9319b69b10f730c8e500089  dataset-validation.mmd
  a1ef6c1c42e780c1b7e63ce667df5a062860bd12789962ba3b3ce88ae9465364  examples/result.json
  f8a72abf489a3f83739e983b6683ad6b383b215c465b5eebf3aa751981e29de7  task.schema.json
  8e1c1030a074b502f93bb21cfa036d3cf7e9fb2693bf899a8f4066eb3b4c0321  result.schema.json
  ```

### 复审结论

| Axis | Verdict | Result |
|---|---|---|
| Spec / Standards | LGTM | DR-016、DR-020、DR-021 及导出 pass/deny 分支已闭环；`architecture.revision.md` 的历史低优先级描述不作为 canonical 规格。 |
| Correctness / Security | Not LGTM | DR-022：运行中受控依赖代理故障仍缺少合法的 Infrastructure retry 路径。 |
| Verification / Implementation Fit | Not LGTM | DR-023：scan record 已进入原子最终化，但扫描覆盖范围仍未可执行、不可验证。 |
| Coordinator holistic pass | Not LGTM | 两个新的主路径 high 阻断 clean verdict。 |

此前的 DR-018 已由 typed producer record 闭环；DR-019 的 checksum-bound 原子扫描提交已修复。DR-023 是对“扫描已发生”的残余覆盖性缺口，并非重复记录 DR-019。

### High findings

#### DR-022 — 运行中依赖代理故障会被误归类，且无法安全进入 Attempt retry

- Severity：high。
- Axis：Correctness / Security / failure recovery。
- Evidence：MP-09 已把 `SANDBOX_STARTING` 中的 runtime proxy health/access 故障放入 Attempt 1 → 清理/缺席证明 → Attempt 2。可是 Agent package install 或 Evaluator install 过程中，在启动健康检查已通过之后，代理仍可能失效；当前状态机只给 `AGENT_RUNNING` 正常的 complete/error/budget/cancel 路径，未定义 `AGENT_RUNNING` 或 `EVALUATING` 中的已分类 proxy outage 如何停止阶段、生成 infrastructure producer record、完成清理并创建 Attempt 2。
- Consequence：实现可把瞬时基础设施故障错误记为 Agent/project install 失败，或在部分依赖状态继续 hidden evaluation；两者都会污染能力统计、破坏可重试 Infrastructure Error 契约，且可能遗漏旧 Attempt 缺席证明。
- Minimal repair：将“代理诊断证实的运行中 dependency-proxy fault”与项目自身 package-manager/install failure 明确分离。前者从 `AGENT_RUNNING` 或 `EVALUATING` 停止当前 phase，不路由到 hidden evaluation，写入同 Attempt infrastructure producer record，完成 container/process/两张网络清理与缺席证明后才创建 Attempt 2；后者保留为项目/Agent failure 且不得重试。V3 增加启动阶段、Agent install、Evaluator install outage 三种正例和项目导致 install failure 的非重试对照。

#### DR-023 — 数据/凭据扫描记录没有类型化覆盖策略，允许“已扫描但未真正检查”

- Severity：high。
- Axis：Verification / Artifact persistence / Security。
- Evidence：MP-12 要求 scan record 绑定 checksum、scanner version 与 coverage/status，但 architecture/Harness 没有规定每个 Artifact 逻辑类型/MIME 的必需覆盖面，也未规定 archive member、截图或二进制内容如何检查。实现可以只扫描 ZIP/image 的元数据或部分字节，仍写入 `passed` scan record 并最终化；Playwright trace ZIP、截图、日志和 Result 都属于 NFR-010 的保护范围。
- Consequence：携带凭据或生产数据的嵌套 trace、图片文字/元数据、未知二进制或因资源限制而未完全检查的 Artifact 可能进入 maintainer-only finalized storage，违背 finalization 前数据卫生 gate。
- Minimal repair：定义版本化 scan-coverage policy；`passed` 只在 exact checksum 满足该 policy 的完整必需覆盖时有效。文本/结构化内容须完整解析；已知 archive（含 trace ZIP）须在深度、展开量和资源限额内递归扫描成员；图片须扫描解码后的元数据与可读文字表面；其他二进制必须使用批准的类型专用 handler。unsupported、partial、encrypted/corrupt、limit exceeded 或 archive bomb 一律 fail closed/quarantine。V0/V1/V4 加入明文、嵌套 trace ZIP、图片/支持的二进制、未知或加密 archive、展开炸弹/限额与 post-scan mutation fixtures。

## 追加修改计划 — 需要审批

本计划仅覆盖 DR-022 和 DR-023。它不修改既有 medium/low，不改变 MVP 的 controlled-network、Artifact 受众或评分范围。

| Plan ID | Findings | Planned edit | Affected artifacts | Verification after edit |
|---|---|---|---|---|
| MP-15 | DR-022 | 定义已诊断的运行中 `DEPENDENCY_PROXY_UNAVAILABLE` 与项目 package-manager/install failure 的归类边界；允许 `AGENT_RUNNING`/`EVALUATING` 仅在前者时停止 phase、禁止进入/继续 hidden evaluation、写入 infrastructure producer record、清理+缺席证明后走 Attempt 2；项目失败保持非重试 | `architecture.md`, `harness-design.md`, `diagrams/run-data-flow.mmd` | V3：启动、Agent install、Evaluator install 三类 proxy outage 均保留 Attempt 1 证据并安全进入 Attempt 2；项目 install failure 不重试且不被误记为基础设施故障 |
| MP-16 | DR-023 | 定义 versioned scan-coverage policy、scan record 的 coverage outcome/policy version 与 exact-checksum 完整覆盖要求；指定文本/结构化、递归 archive、截图/图片、批准二进制 handler 的检查面；对 unsupported、partial、encrypted/corrupt、archive bomb、resource/depth limit fail closed/quarantine，并补齐 V0/V1/V4 fixture 契约 | `architecture.md`, `harness-design.md` | V0 schema/fixture：明文、嵌套 trace ZIP、图片/支持二进制、未知或加密 archive、bomb/limit；V1 缺失/过期/部分 coverage 阻断最终化；V4 trace/截图/日志 Result 的全覆盖与 post-scan mutation 检查 |

### 追加计划审批

- 需要决定：是否批准 MP-15 与 MP-16，作为本轮唯一追加的 high 修复集。
- 建议：批准。两项只补全已经批准的重试和数据卫生主路径，避免代理短暂故障污染评估，且确保任何最终化 Artifact 都经过可验证的完整扫描。
- 批准后：重新计算输入指纹，只应用 MP-15/MP-16，运行客观检查，然后重新运行三个独立 reviewer 轴与 Coordinator holistic pass；任何新的 critical/high 将再次写入计划并重新走审批。

### 追加计划审批记录

- 日期：2026-07-13。
- 决定：批准 MP-15 与 MP-16。
- 来源：Plannotator 人工审批。
- 批准范围：仅 DR-022 与 DR-023 的状态、恢复、扫描覆盖策略和对应流程/验证契约；不包含既有 medium/low 清理或 Schema/生产代码实现。

### 追加计划应用记录

| Plan ID | 状态 | 已应用范围 |
|---|---|---|
| MP-15 | 已应用 | 将 startup、Agent install、Evaluator install 的 snapshot-bound proxy 诊断分开建模；Agent/Evaluator 活跃 phase 的已证实 outage 写入 `infrastructure_interrupted` + infrastructure producer record，清理/缺席证明后才允许 Attempt 2；项目 install failure 保持非重试。 |
| MP-16 | 已应用 | 加入 versioned data-scan-coverage policy、exact-checksum full-coverage finalization 条件、递归 trace/archive、图片/批准二进制 handler 与 unsupported/partial/encrypted/corrupt/limit/archive-bomb fail-closed 契约；补齐 V0/V1/V4 夹具验证范围。 |

## 第四轮追加修复复审 — 新发现与追加计划

### 复审结论

| Axis | Verdict | Result |
|---|---|---|
| Spec / Standards | Not LGTM | DR-024：Evaluator 安装阶段的基础设施中断不能改写已完成的 Agent outcome。 |
| Correctness / Security | Not LGTM | DR-025：proxy diagnostic 缺少可信事实边界；DR-026：复杂 Artifact scanner 缺少执行隔离。 |
| Verification / Implementation Fit | Not LGTM | DR-024：持久化模型无法同时表达已完成 Agent 与 Evaluator 阶段基础设施中断。MP-16 的扫描覆盖/最终化/恢复闭环已通过。 |
| Coordinator holistic pass | Not LGTM | 三个主路径 high 阻断 clean verdict。 |

### High findings

#### DR-024 — Agent outcome 被 Evaluator 阶段的基础设施中断覆盖

- Severity：high。
- Axes：Spec / Standards；Verification / Implementation Fit。
- Evidence：MP-15 把 `infrastructure_interrupted` 放入单一 `agentOutcome`，并要求 Agent 或 Evaluator install outage 都写入该值。但 Evaluator install 发生在 Agent 已完成、`AGENT_STOPPING → WORKSPACE_FROZEN → EVALUATING` 之后；`agentOutcome=completed` 已是不可变事实。现有 attempts 数据只有一个 `agent_outcome` 与 `termination_cause`，无法同时保存这两个事实。
- Consequence：实现要么改写 Agent 的真实 outcome，要么违反状态契约，污染 Agent 与平台可靠性归因、比较和恢复语义。
- Minimal repair：`agentOutcome` 只描述 Agent 的实际终态；使用 Attempt 级 `executionClassification=infrastructure_error`、`terminationCause=DEPENDENCY_PROXY_UNAVAILABLE`、`terminationPhase=sandbox_starting|agent|evaluation` 和 infrastructure producer record 表示中断。启动前仍为 `not_started`；Agent install 被 Coordinator 停止时为 `cancelled` 且保留 termination cause；Evaluator install outage 必须保持 `agentOutcome=completed`。V3/V4 真值表同时断言 Agent outcome 与 Attempt 分类。

#### DR-025 — 代理诊断没有可信事实边界，项目失败可伪装成可重试基础设施错误

- Severity：high。
- Axis：Correctness / Security。
- Evidence：MP-15 允许 “snapshot-bound proxy diagnostic proves outage” 产生 Attempt 2，但未定义该诊断的可信 producer、最小观测、request correlation 或 schema；也未禁止依赖不可信 package-manager exit code/stdout/stderr。项目可制造 timeout/5xx 文本、客户端 DNS 或本地资源故障并被误归类。
- Consequence：Agent/project failure 可以获得自动重试、跳过 hidden evaluation 并污染能力与可靠性指标，等同把 retry 决定交给不可信 Sandbox 输入。
- Minimal repair：定义仅由 trusted Coordinator/proxy-side 产生的 proxy diagnostic record，绑定 Attempt、dependency snapshot、proxy configuration hash、时间及安装请求 correlation；必须有独立可信 health/access 观测证明 snapshot-bound proxy 服务端不可用，且不得由 Sandbox 命令输出单独触发。明确区分 proxy-side outage、Sandbox policy violation、客户端 DNS/配置、包完整性/项目脚本和本地资源错误。V3/V4 增加 forged stderr/exit、client-only failure、真实 proxy outage、stale/mismatched diagnostic 和 recovery race fixtures。

#### DR-026 — Archive/image/binary 扫描器处理不可信内容时缺少隔离执行契约

- Severity：high。
- Axis：Correctness / Security。
- Evidence：MP-16 要求递归解析 archive、图片元数据/可读文字和类型专用 binary handler，但 `data-scan` 仍是可信宿主模块，没有 scanner worker/sandbox、无网络、只读输入或不落盘 archive 规则。现有 no-follow collector 只保护收集工作树，未覆盖嵌套 archive decoder。
- Consequence：Agent 构造的 Trace ZIP、图片或二进制可通过 zip-slip、链接成员或 decoder 故障读写宿主路径、读取宿主资源或扩大解析器失陷影响面；深度与资源限额无法关闭这些路径。
- Minimal repair：复杂 handler 必须在一次性、最小权限的 scanner worker/sandbox 中运行：无 host/LAN/Internet、只读 content-addressed input、无可写宿主挂载、受限 CPU/memory/time/output。Archive 使用不落盘成员检查，或只在 beneath/no-follow 临时目录解包，拒绝绝对路径、`..`、symlink、hardlink 和 device。worker crash/timeout/OOM/handler fault 一律 fail closed/quarantine。增加 zip-slip、archive link、恶意 metadata、handler crash/OOM/timeout 与 worker 后 checksum 变化 fixtures。

### Low record

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| DR-L04 | low | Run state diagram 重复 `AGGREGATING → COMPLETED` 边 | 记录；不在 high 修复中顺带编辑。 |

## 追加修改计划 — 需要审批

本计划只覆盖 DR-024 至 DR-026。它保留 MP-16 已通过的 coverage policy，不扩大 MVP 功能范围，也不实现生产代码或既有 low 清理。

| Plan ID | Findings | Planned edit | Affected artifacts | Verification after edit |
|---|---|---|---|---|
| MP-17 | DR-024 | 将 `agentOutcome` 恢复为 Agent 专属事实；增加 Attempt 级 `terminationPhase`，以 `executionClassification`、`terminationCause`、termination phase 与 infrastructure producer record 表达中断。明确 startup=`not_started`、Agent install stop=`cancelled`、Evaluator install outage 保留 `completed`，并同步状态/流程/真值表 | `architecture.md`, `harness-design.md`, `diagrams/run-data-flow.mmd` | V3/V4 startup、Agent-install、Evaluator-install outage fixture 同时断言 Agent outcome、termination phase、infrastructure classification、Attempt 2 与无 hidden-evaluation continuation |
| MP-18 | DR-025 | 定义 trusted Coordinator/proxy-side `proxy-diagnostic-record` 契约、producer、snapshot/config/time/request correlation 与可接受服务端观测；显式禁止凭 untrusted package-manager 输出重试，列出 proxy/policy/client-DNS/integrity/project/local-resource 的互斥归类 | `architecture.md`, `harness-design.md` | V3/V4 forged stderr/exit、client-only failure、真实 proxy outage、stale/mismatched diagnostic、recovery race 与无误重试分类 fixtures |
| MP-19 | DR-026 | 为复杂 data-scan handler 定义 disposable least-privilege scanner worker/sandbox、只读 content-addressed input、无 host/LAN/Internet/可写宿主挂载、CPU/memory/time/output 限制、archive safe-inspection/no-follow 规则和 worker failure fail-closed；同步 policy、最终化和验证契约 | `architecture.md`, `harness-design.md` | V0/V1/V4 zip-slip、archive symlink/hardlink/device、恶意 image metadata、worker crash/OOM/timeout、post-worker checksum mutation 与 finalization quarantine fixtures |

### 追加计划审批

- 需要决定：是否批准 MP-17 至 MP-19，作为本轮唯一新增的 high 修复集。
- 建议：批准。它们只关闭刚引入/暴露的归因、重试可信性与 scanner 执行边界，不改变已批准的产品范围或评分语义。
- 批准后：重新计算输入指纹，只应用 MP-17/MP-18/MP-19，运行客观检查，然后重新运行三个独立 reviewer 轴与 Coordinator holistic pass；任何新的 critical/high 将再次走同一审批门。

### 追加计划审批记录

- 日期：2026-07-13。
- 决定：批准 MP-17 至 MP-19。
- 来源：Plannotator 人工审批。
- 批准范围：仅 DR-024 至 DR-026 的 Agent/Attempt 归因、可信 proxy diagnostic、scanner worker 隔离及对应契约/流程/验证；不包含既有 low 清理或生产代码实现。

### 追加计划应用记录

| Plan ID | 状态 | 已应用范围 |
|---|---|---|
| MP-17 | 已应用 | `agentOutcome` 恢复为不可变 Agent 事实；Attempt 以 `terminationCause`/`terminationPhase`/`executionClassification` 表达中断。startup 为 `not_started`、Agent install stop 为 `cancelled`、Evaluator install 保留已最终化的 Agent outcome。 |
| MP-18 | 已应用 | 增加 trusted Coordinator/proxy-side `proxy-diagnostic-record`，要求 Attempt/snapshot/config/time/request correlation 的独立观测，禁止以不可信 package-manager 输出触发重试，并列出互斥非重试分类。 |
| MP-19 | 已应用 | 复杂 archive/image/binary 解析进入 disposable least-privilege scanner worker；约束只读 content-addressed 输入、无 host/LAN/Internet/可写宿主挂载、资源限额、安全 archive 检查和 worker fault fail-closed。 |

## 第四轮最终 Deep 复审 — 通过

### 最终输入指纹

```text
ae871455f6948f5ed85468534270e33c534594555090f51fdb2cbfc8f958bc6d  requirements.md
0e6ce308a8f098af398211b4f83a90c259c8169511bf06f32e08b592b32699a4  architecture.md
7fff2a3a40970d85d486d6053f9f6f76f00fb93fdbeed02b3c88b8731620be98  architecture.revision.md
ed22f161781cc890bd69956cd6059c51a678724fed2c672d4bd457d0cd97dc88  harness-design.md
76542f2a3896d82bcadf41af8acba0b3dbed590f1e7b47b6f07a06092084ee3e  architecture.mmd
cf55080eb4c92be5fecef9fe0d486f2be7832711c9fb731b38afa04885d26032  run-data-flow.mmd
13b73177539678080c246032a03216fe615dc7a15828aaeb26ca8b958aefabdd  scoring-flow.mmd
8a3b94723a3014b48581444e15a41ef363002bea9319b69b10f730c8e500089d  dataset-validation.mmd
a1ef6c1c42e780c1b7e63ce667df5a062860bd12789962ba3b3ce88ae9465364  examples/result.json
f8a72abf489a3f83739e983b6683ad6b383b215c465b5eebf3aa751981e29de7  task.schema.json
8e1c1030a074b502f93bb21cfa036d3cf7e9fb2693bf899a8f4066eb3b4c0321  result.schema.json
```

### 独立轴与整体结论

| Axis | Verdict | Result |
|---|---|---|
| Spec / Standards | LGTM | MP-17 归因正交、MP-18 trusted diagnostic、MP-19 scanner worker 的规格和阶段契约一致。 |
| Correctness / Security | LGTM | Retry authority 不再由不可信输出决定；扫描复杂输入的 host-boundary 已最小权限化并 fail closed。 |
| Verification / Implementation Fit | LGTM | Agent/Attempt 真值表、proxy diagnostic 负向夹具、worker/coverage/finalization/recovery 夹具均可非自证地实施。 |
| Coordinator holistic pass | LGTM | 当前 canonical 输入不存在 critical/high；可作为后续测试与实现阶段的设计入口。 |

### 客观检查

- `git diff --check`：通过。
- `jq empty schemas/task.schema.json schemas/result.schema.json examples/result.json`：通过。
- `run-data-flow.mmd` 的 `alt`/`loop`/`opt` 与 `end` 结构计数：12/12。
- 当前环境未提供 Mermaid renderer；已执行源结构检查，未声称渲染截图验证。

### Deferred medium / low

| ID | Severity | Disposition |
|---|---|---|
| DR-M09 | medium | `FR-014, NFR-010, SC-013` 的修订追踪行仍标为 V0/V6，尚未把 V1/V4 的 Artifact/Result worker-finalization gate 单列。正文和 V0/V1/V4 契约已完整；按本次只修 critical/high 的批准范围记录，不顺带编辑。V1 实施计划定稿前应拆分 Bundle publish 与 runtime finalization 的追踪行。 |
| DR-L02–DR-L04 | low | 保留历史 revision 文案、重复 observable 文案及重复 Run 图边；不影响 canonical 行为，不在本轮清理。 |

### Final verdict

- Remaining critical/high bugs：none。
- Review intensity：forced `deep`；三个独立 reviewer 轴完成，无降级。
- 结论：设计复审通过。下一步可进入 `$idea-to-ship:test --mode gate --slug frontend-agent-benchmark`，再实施 V0。

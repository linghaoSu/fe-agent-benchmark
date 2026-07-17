# Frontend Coding Agent 评测系统需求

> 状态：已批准，Build-ready  
> Slug：`frontend-agent-benchmark`  
> 更新时间：2026-07-13

## 1. 背景与问题

前端 Coding Agent 的能力不仅由模型决定，还取决于 System Prompt、上下文策略、Agent Harness、文件/Shell/浏览器工具以及重试与自我修复策略。当前缺少一个能够固定任务、环境、预算和评分规则，并完整保留运行证据的平台，因此：

1. 不同 Agent、模型、Prompt、Harness 和工具链之间的横向结果不可稳定比较。
2. Agent 版本变化是否引入能力退化，缺少可重复的回归门禁。
3. 功能、视觉、响应式、可访问性、工程质量与执行成本常被混成单一分数，难以解释失败。
4. 隐藏测试隔离、环境版本、随机种子和运行制品不足时，结果不可审计或复现。

## 2. 为什么现在做

项目当前已经具备评测目标、流程、评分原则、示例任务、示例结果和 Schema 草案，但尚未形成可执行闭环。此时应先验证最小本地评测链，尽早暴露隔离、复现和评分语义中的高风险问题，再投入任务规模、Dashboard 和多 Agent Benchmark。

## 3. 用户与决策

### ACT-01 — Agent/前端基础设施团队

- 使用系统验证 Agent 新版本是否发生能力退化。
- 将真实 Bug 和历史失败沉淀为持续回归任务。

### ACT-02 — 模型与 Harness 选型团队

- 在固定任务、环境和预算下比较不同模型、Prompt、Harness、工具和重试策略。
- 同时查看质量向量、稳定性、成本、Token、Tool Calls 和 Wall Time。

### ACT-03 — 任务与 Evaluator 维护者

- 创建、校准、版本化和发布任务。
- 用 Gold、Alternative 和 Mutation 验证评测规则不过拟合特定实现。

### 优先级决定

版本回归门禁与横向方案比较同等优先；MVP 的数据模型和 CLI 输出必须同时支持这两类决策。

## 4. MVP 范围

### 4.1 范围内

- 本地单机 CLI。
- 单个 Worker 顺序执行 Run。
- Docker Sandbox；宿主机可信，Sandbox 内的 Agent 执行内容不可信。
- 注册且受信任的 Agent Adapter 作为宿主控制平面，可通过网络访问配置的远程模型提供商；该访问不授予 Docker Sandbox 任意外网能力。
- Agent 与 Evaluation 两阶段均默认拒绝访问宿主、LAN 与互联网；只允许同一 Run 内 Mock API、被测应用、隔离 Browser、受控 Controller 与维护者控制的依赖缓存/包代理的必要通道。
- 隐藏 Evaluator 源码和隐藏行为数据均保密；被测应用、Browser、服务器及任何请求者均不得获得隐藏行为信号。
- 可注册的 Mock Agent 或命令式 Agent Adapter。
- 版本化 Task、Suite、Run、Environment、Agent、模型、Prompt 和 Harness 标识。
- Integrity、Build、Functional、Visual、Responsive、Accessibility 评估。
- 结构化 Result、完整运行轨迹和可复现 Artifact manifest。
- 固定 seed 的重复运行。
- Infrastructure Error 自动重试一次；Agent Failure 不自动重试。
- 先完成 2 个校准样板任务，再扩展至 10 个 MVP 任务。
- 通过 CLI 或机器可读报告比较不同配置和版本。
- 完整隐藏 Evaluator Artifact 只保留在维护者侧；请求者仅获得脱敏结果包和自身 Agent 阶段 Artifact。
- 所有公开与隐藏测试数据必须为合成或不可逆匿名化数据。
- Docker MVP 防御常规文件、网络、权限与资源越权；运行在维护者专用或可销毁主机上。

### 4.2 范围外

- Web Dashboard。
- API 服务、分布式 Worker、队列和多租户。
- K8s、Firecracker、弹性调度和云 Artifact Store。
- 私有 Holdout Benchmark 和公开排行榜。
- 需要任意外部服务访问、未锁定依赖或未受控依赖源的评测任务。
- 请求者读取原始隐藏 Evaluator Artifact，或共享主机上的多用户 Artifact 访问。
- Docker、Browser 或内核 0-day 防御；抵御此类攻击需要后续微虚机/隔离宿主方案。
- Vue、Angular、Monorepo、微前端等多生态扩展。
- 使用 LLM/VLM Judge 判定确定性功能。
- 将成本、Token 或耗时直接混入功能质量分。
- 完整 Performance 与开放式代码质量 Judge；MVP 可采集相关原始指标，但不作为 solved 门槛。

## 5. 功能需求

### FR-001 — 加载并校验版本化任务

系统必须通过 CLI 按 Task ID 加载任务，并在创建 Run 前验证任务结构、schemaVersion、版本、环境、预算、权限、命令和评估规则。无效任务必须在 Agent 启动前失败，并返回可定位的字段错误。

### FR-002 — 固化运行身份与输入

每个 Run 必须获得唯一 Run ID，并记录 Task/Suite/Environment/Agent/模型/Prompt/Harness 版本、代码仓库 Commit、Task Bundle Checksum、seed、Locale、Timezone、Viewport、预算和实际重试次数。

### FR-003 — 创建受限执行环境

系统必须为每次 Run 创建独立 Docker Sandbox，注入 Agent 可见的代码、任务说明和公开测试，并在 Agent 与 Evaluation 阶段的 Sandbox 执行中默认拒绝宿主/LAN/互联网网络策略。只允许每次 Run 内部声明的 Mock API、被测应用、隔离 Browser、受控 Controller 与维护者控制的依赖缓存/包代理通道。`npm`、`pnpm` 等依赖安装仅可使用锁定依赖和该受控来源；缺少锁定、缓存或允许的内部代理时必须在 Agent 启动前被拒绝。注册 Adapter 由宿主控制平面单独访问配置的远程模型提供商，且不得把模型凭据、端点或未脱敏响应传入 Sandbox。系统还必须执行任务声明的可写路径、禁止路径、依赖变更和资源预算约束。

### FR-004 — 隐藏验证数据不可见

Agent 运行期间不得读取、枚举或通过其他进程间接获取隐藏测试、参考实现、Mutation、评分规则私有部分或 Evaluator 源文件。隐藏行为数据（输入值、路由、Mock 响应、时序与断言触发）也不得经被测应用、Browser、服务器、网络、Trace、截图、日志或导出包泄露给 Agent 或请求者。只读挂载不满足该要求。

### FR-005 — 执行可替换 Agent Adapter

CLI 必须能选择已注册的 Agent Adapter，并向其提供同一类公开任务上下文、工具边界和预算。Adapter 可从可信宿主访问配置的远程模型提供商，但只能通过 Tool Router 对 Sandbox 产生影响。Adapter 必须输出结构化事件，至少包括已脱敏的模型交互摘要、提供商/模型/版本/采样配置标识、Tool Call、文件变更、命令、时间和终止原因；模型凭据、端点和原始敏感响应不得进入 Sandbox 或 Artifact。

### FR-006 — 冻结 Agent 结果后评估

系统必须在 Agent 完成、失败或预算耗尽后终止 Agent 访问，冻结最终工作区和 Patch，再启动隐藏 Evaluator。Agent 与隐藏 Evaluator 不得并发运行。

### FR-007 — 按确定顺序执行评估链

MVP 必须按以下顺序运行：Integrity → Install/Build/Typecheck/Lint/Test → Functional → Visual/Responsive → Accessibility → Engineering Checks → Result Aggregation。阶段可根据前置门槛短路，但必须记录未运行原因。

### FR-008 — 执行关键门槛

- 修改验证器、访问禁止数据或违反关键权限时，Run 必须标记为 Invalid。
- Build/Start 失败时，Run 可以 Valid，但不得标记为 Solved。
- Critical Functional Test 失败时，Run 不得标记为 Solved。
- 视觉、可访问性或其他分数不得抵消关键功能门槛失败。

### FR-009 — 区分失败归因

系统必须区分至少以下结果：Invalid、Agent Failure、Infrastructure Error、Evaluator Error、Budget Exhausted 和 Solved。禁止访问宿主、LAN 或互联网的行为必须标记为 Invalid，立即停止当前阶段且不得自动重试。失败必须带阶段、稳定错误码、严重度和证据引用。

### FR-010 — 输出分项结果与效率指标

Result 必须分别输出 valid、solved、Build、Functional、Visual、Responsive、Accessibility、Engineering 等分项结果，以及 input/output tokens、Tool Calls、Wall Time、Cost 和重试次数。效率指标不得直接改变功能质量分。

### FR-011 — 保存可审计 Artifact

每个 Run 必须保存或明确标记不适用的以下产物：

- `result.json`
- `patch.diff`
- `agent-events.jsonl`
- `commands.log`
- `playwright-trace.zip`
- `screenshots/`
- `evaluator-results/`
- Artifact manifest（含文件大小、checksum、生成阶段和相对路径）

完整隐藏 Evaluator Artifact（包括原始 Evaluator Result、Trace、截图、DOM/网络日志和断言详情）必须仅存放在维护者控制的目录。请求者导出包只能包含公开 Task/Suite 标识与版本、配置版本、valid/solved、质量向量、预先声明且粗粒度的公开失败类别/代码、效率指标及通过数据扫描的 Agent 自身 patch/events/log 摘要；公开代码不得编码隐藏路由、输入、断言、时序或私有 Evaluator code，且导出不得包含 private message、evidence reference、隐藏 Bundle、原始 Evaluator Artifact 或其他可反推隐藏行为的数据。

### FR-012 — 支持重复运行

CLI 必须允许同一 Task 与 Agent 配置按固定 seed 或 seed 列表重复运行，并保留每次独立 Result。聚合输出必须能计算 success@1、success-any@k、success-all@k、稳定性、成本和耗时。

### FR-013 — 支持本地结果比较

用户必须能通过 CLI 或机器可读的脱敏报告，按 Task、Suite、Agent、模型、Prompt、Harness 和版本比较质量向量、solved 状态、失败分类、成本与耗时；MVP 不要求 Web UI。完整 Artifact 只可由维护者本地诊断。

### FR-014 — 校准任务与 Evaluator

每个进入 MVP 数据集的任务必须包含：公开需求、固定初始代码、公开 Smoke Test、隐藏行为测试、评分规则、至少一个 Gold、至少一个结构不同的 Alternative Correct Solution，以及能代表目标缺陷的 Mutation。所有公开和隐藏 Bundle 均不得含真实用户数据、生产数据、凭据、Token 或其他敏感内容；只能使用合成或不可逆匿名化数据。校准报告必须记录各实现的预期与实际结果。

### FR-015 — 执行失败重试策略

系统必须仅对 Infrastructure Error 自动重试一次。重试必须创建独立 Attempt 并保留首次失败证据。Agent Failure、Invalid、Budget Exhausted 和确定性 Evaluator 失败不得自动重试。

### FR-016 — 提供完成标准命令

项目必须支持以下本地流程：

```bash
pnpm install
pnpm build
pnpm eval run react-orders-filter-017
```

最后一条命令必须生成符合 FR-010 和 FR-011 的 Run 结果目录。

## 6. 非功能需求

### NFR-001 — 隐藏数据安全

在定义的路径遍历、进程枚举、挂载探测、Shell 搜索、网络转发、Browser 交互、Trace/截图/日志导出和间接读取安全测试中，Agent 或请求者获取隐藏 Evaluator 源码或隐藏行为数据的成功次数必须为 0。任何成功读取、行为信号外泄或未经授权的 Artifact 导出均阻断 MVP 发布。

### NFR-002 — 可复现性

对于固定 Task Bundle、代码 Commit、Environment、Agent 配置、seed、锁文件和受控依赖缓存版本，以及 Sandbox Agent/Evaluation 两阶段均无任意外部网络的确定性样板任务，重复运行必须得到相同的 valid/solved、门槛结果和离散失败码；允许时间、Token 和成本等非确定数值不同。该逐次确定性要求适用于 Mock、回放或提供确定性承诺的 Adapter。使用真实远程模型提供商的 Run 必须记录提供商/模型/版本/采样配置，并通过 success@k、稳定性与成本分布评估；不得把模型输出逐次完全一致当作前提。

### NFR-003 — 验证器校准

- Gold Solution 通过率：100%。
- Alternative Correct Solution 通过率：100%。
- 已定义 Mutation 捕获率：100%。
- 任一不满足时，对应任务不得进入已发布 MVP Suite。

### NFR-004 — 基础设施可靠性

在固定本地基线环境的 50 次样板 Run 中，最终 Infrastructure Error 比例必须低于 2%；自动重试前后的 Attempt 数据必须分别保留，不能用重试隐藏原始错误率。

### NFR-005 — 可审计性

Result 中的每个失败、门槛和分项结论必须引用至少一个结构化 Evaluator Result 或 Artifact。Artifact manifest 的 checksum 校验必须全部通过。

### NFR-006 — 兼容性

Schema 必须具有显式版本。读取器必须拒绝未知重大版本，并对受支持旧版本提供测试覆盖；新增可选字段不得改变同版本旧数据的既有含义。

### NFR-007 — 预算执行

系统必须执行 Task 声明的 Wall Time、Agent Step、Cost、网络、路径和依赖变更预算；网络策略同时适用于 Agent 与 Evaluation 阶段的 Sandbox 执行。依赖安装只允许访问锁定且维护者控制的缓存/包代理；未锁定或未允许的依赖访问必须在预检失败。宿主 Adapter 到已配置模型提供商的控制平面访问不属于 Task 网络预算，但其可用性、模型标识、版本、采样配置、Token、Cost 和失败码必须记录。预算耗尽必须在限定动作完成后终止，并产生可解释结果，不得无限等待。

### NFR-008 — 本地可操作性

在文档声明并通过环境预检的维护者专用或可销毁开发机上，用户只需项目依赖和 Docker 即可运行 FR-016 的流程；缺失 Docker、浏览器镜像或依赖时必须在 Agent 启动前给出修复指引。MVP 不承诺抵御 Docker、Browser 或内核 0-day，也不支持共享主机多用户读取完整 Artifact。

### NFR-009 — 隐藏 Artifact 与导出控制

完整隐藏 Evaluator Artifact 必须只存放在维护者控制的本地存储。请求者只能通过显式脱敏导出获得允许字段；导出必须验证不含隐藏 Bundle、原始 Evaluator Result、Trace、截图、DOM/网络日志、断言文本或可反推隐藏行为的数据。所有 Suite 类型均采用同一严格策略。

### NFR-010 — 测试数据卫生

Task Bundle、Evaluator Bundle、Mock 数据、截图、Trace、日志和 Result 不得包含真实用户数据、生产数据、凭据、Token 或可用于访问外部系统的秘密。模型提供商凭据只可存在于可信宿主 Adapter 的短生命周期配置中，且不得进入 Sandbox、Bundle、日志、Trace、Result 或导出包。Bundle 发布与 Artifact finalization 前必须执行相应的敏感数据/凭据校验。

## 7. 成功标准

| ID | 成功标准 | 检查方式 |
|---|---|---|
| SC-001 | 示例任务端到端执行并生成完整结果目录 | 执行 FR-016 命令并校验 Result Schema 与 Artifact manifest |
| SC-002 | Gold 与 Alternative 通过率均为 100% | 对每个已发布任务运行校准矩阵 |
| SC-003 | 已定义 Mutation 捕获率为 100% | 对每个 Mutation 运行对应 Evaluator 并核对预期失败码 |
| SC-004 | 隐藏源码与行为数据泄露为 0 | 执行 NFR-001 的文件、进程、网络转发、Browser、Trace/截图/日志和导出安全测试套件 |
| SC-005 | 固定输入和 seed 的确定性结论一致；远程模型 Run 可量化稳定性 | 对 Mock/回放/确定性 Adapter 重复运行并比较门槛和离散结果字段；对真实远程模型按固定提供商/模型/版本/采样配置生成 success@k、稳定性与成本分布报告 |
| SC-006 | 50 次基线运行最终 Infrastructure Error 低于 2% | 汇总 Run 与 Attempt 结果，分别报告原始和重试后错误率 |
| SC-007 | 关键门槛不可被其他分数抵消 | 使用 Build 失败和 Critical Functional 失败夹具验证 solved=false |
| SC-008 | 基础设施错误只自动重试一次，Agent 失败不重试 | 使用可控失败 Adapter/Sandbox 执行状态转换测试 |
| SC-009 | 回归和横向比较均可由本地输出完成 | 对两版 Agent 配置重复运行并生成质量、稳定性和效率对比 |
| SC-010 | 2 个样板任务完成校准后可扩到 10 个任务 | 校准报告通过 NFR-003，且任务 Bundle 均通过版本/checksum 校验 |
| SC-011 | 请求者导出不含隐藏 Evaluator Artifact 或行为线索 | 对完整 Run 执行脱敏导出，以 allowlist/denylist、私有码/引用排除和差分非干扰夹具验证 NFR-009；仅隐藏断言细节变化时，除批准的聚合质量字段外导出不得出现额外差异 |
| SC-012 | Sandbox Agent 与 Evaluation 两阶段均拒绝任意外部、宿主和 LAN 访问，但允许锁定依赖的受控包代理；可信 Adapter 可访问配置模型提供商 | 使用 Browser 与服务器同源 relay、host-gateway、LAN、外网、WebSocket 和重定向夹具验证均被拒绝并标记 Invalid；使用 `pnpm install --frozen-lockfile` 经内部缓存/代理验证允许依赖安装；验证模型调用仅发生在宿主 Adapter 且凭据未进入 Sandbox/Artifact |
| SC-013 | Bundle 和 Artifact 不含敏感数据或凭据 | 对发布 Bundle 与 finalized Artifact 执行数据卫生/凭据校验；任何命中阻断发布或导出 |

## 8. 可接受失败与降级

- 单次 Infrastructure Error 可自动重试一次；若再次失败，Run 以 Infrastructure Error 结束并保留两个 Attempt。
- Agent、被测应用或 Evaluator 阶段的 Browser 访问宿主、LAN 或任意未允许外部地址时，Run 标记为 Invalid，立即停止当前阶段且不自动重试。锁定依赖经维护者控制缓存/包代理的安装不属于该违规；可信宿主 Adapter 对已配置模型提供商的访问不属于 Sandbox 网络违规。
- Agent Failure 不自动重试，以免改变 success@1 和掩盖真实可靠性；用户可显式发起新的独立 Run。
- 非关键视觉、响应式或可访问性失败可以使 Run 保持 Valid，但是否 Solved 由任务明确声明的关键门槛决定。
- 可选 Artifact 因前置阶段未执行而缺失时，manifest 必须记录 `not_applicable` 及原因；不得伪造空文件代表成功。
- 无法验证隐藏数据隔离、checksum 或关键功能门槛时，系统不得降级为可信结果。
- 无法确定导出包不含隐藏 Artifact 或行为线索时，不得导出给请求者；完整 Run 仅可由维护者本地保留和诊断。

## 9. 约束与原则

- Evaluator 只能在 Agent 停止且工作区冻结后运行。
- 确定性问题必须使用自动测试，不使用 LLM/VLM Judge 替代。
- Benchmark 与 Regression Suite 必须在概念和数据模型上分开。
- 功能正确性优先于视觉与代码风格。
- 结果必须保留完整分项向量，不只保留单一总分。
- 环境必须固定 Node、浏览器、字体、Locale、Timezone 和基础镜像版本。
- Agent 与 Evaluation 两阶段的 Sandbox 执行对外网络均默认拒绝；只开放 Run 内明确声明的必要内部通道及锁定依赖的维护者控制缓存/包代理。远程模型调用只由可信宿主 Adapter 发起，不能成为 Sandbox 外网通道。
- 完整隐藏 Artifact 与请求者导出包必须物理分离；所有 Suite 使用相同严格导出策略。
- 所有测试和 Artifact 数据必须合成或不可逆匿名化，不得包含凭据或生产数据。
- Docker MVP 仅承诺常规策略越权防护，需在维护者专用或可销毁主机运行；0-day 防御不属于本阶段承诺。
- 测试修改、隐藏数据访问和关键权限违规必须可被 Integrity 检测。

## 10. 外部触点与预期产物

- 输入触点：`examples/task.yaml`、任务代码仓库、公开任务材料、隐藏 Evaluator Bundle。
- 输出触点：`runs/<run-id>/` 目录、机器可读 Result 和对比报告。
- 契约触点：`schemas/task.schema.json`、`schemas/result.schema.json`，后续补充 Suite/Run/Artifact/Evaluator Result Schema。
- 流程触点：`diagrams/architecture.mmd`、`run-data-flow.mmd`、`dataset-validation.mmd`、`scoring-flow.mmd`。
- 后续设计产物：`.idea-to-ship/frontend-agent-benchmark/architecture.md`。

## 11. 需求追踪来源

- `README.md`：完整 Agent 系统评测、确定性验证优先、可复现和分项结果原则。
- `PLAN.md`：Benchmark/Regression 区分、维度、任务构成、流水线、评分门槛、校准与 MVP 验收。
- `CODEX_TASK.md`：MVP 命令、Run 目录、安全隔离、错误分类和技术设计交付物。
- `examples/*`、`schemas/*`：当前 Task/Result 契约基线和需要收紧的字段。
- 已批准 `roadmap.md`：M0–M6 顺序、MVP 本地纵向切片和规模化后置。
- 2026-07-10 用户决策：横向比较与回归同等优先；本地单机 CLI；可信宿主 + 不可信 Agent + Docker；接受量化成功标准；Infrastructure Error 重试一次，Agent Failure 不重试。
- 2026-07-13 用户确认的威胁模型：Agent 与 Evaluation 两阶段的 Sandbox 执行均拒绝任意外部/宿主/LAN 网络，但允许锁定依赖经维护者控制的缓存/包代理安装；注册可信 Adapter 可在宿主控制平面访问配置的远程模型提供商；隐藏源码与行为数据均保密；完整隐藏 Artifact 仅维护者可访问、请求者只获得脱敏导出；所有 Suite 采用同一严格策略；策略越权为 Invalid；所有测试数据合成或不可逆匿名化；Docker 防御常规越权但不承诺 0-day 防御。

## 12. 开放问题

当前没有阻断 MVP 架构的用户决策。以下既有问题已在 Grill 中确认：JSON Schema 为唯一事实来源；SQLite 保存元数据、文件系统保存 Artifact；Adapter 使用 stdio JSONL 子进程协议；Evaluator Browser 为隔离运行时；10 个任务采用 3 功能、3 Bug、1 视觉、1 异步、1 可访问性、1 重构分布。

## 13. 审批决定

需要审批：本修订稿是否准确表达 MVP 的用户、范围、Sandbox 双阶段网络边界、可信宿主 Adapter 的远程模型访问、隐藏行为保密、Artifact 访问控制、数据卫生、可接受失败和量化成功标准，并可作为更新后的架构设计输入。

推荐：批准。该修订稿将“可信控制平面联网、Sandbox 默认拒绝网络”的边界转换为可测试契约，并将远程模型不确定性纳入 success@k/稳定性评估。

批准后的下一步：执行 `$idea-to-ship:architect --slug frontend-agent-benchmark`，同步架构与已批准需求后重新进行设计评审。

### 历史审批记录

- 日期：2026-07-10
- 决定：批准本需求作为架构设计输入。
- 来源：Plannotator 人工审批。
- 审批产物：本文件。
- 说明：该记录仅适用于 2026-07-10 版本；本次修订需要新的审批。

### 修订审批记录

- 日期：2026-07-13
- 决定：批准本修订需求作为更新后架构设计输入。
- 来源：Plannotator 人工审批。
- 覆盖范围：双阶段默认拒绝网络（受控依赖缓存/包代理例外）、隐藏源码与行为保密、维护者完整 Artifact/请求者脱敏导出、数据卫生与 Docker 安全边界。
- 下一步：执行 `$idea-to-ship:architect --slug frontend-agent-benchmark`，同步架构后重新设计评审。
- 说明：该记录适用于 v1；远程模型控制平面访问的 v2 修订需要新的审批。

### v2 修订审批记录

- 日期：2026-07-13
- 决定：批准可信宿主 Adapter 访问配置远程模型提供商的控制平面例外。
- 来源：Plannotator 人工审批。
- 覆盖范围：Sandbox 默认拒绝网络保持不变；模型凭据不得进入 Sandbox、Artifact 或导出包；远程模型稳定性使用 success@k/分布指标而非逐次完全相同输出。
- 下一步：同步 `architecture.revision.md` 后重新进行架构修订审批。

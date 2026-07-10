# Frontend Coding Agent 评测系统总览 Roadmap

> 状态：已批准  
> 更新时间：2026-07-10  
> 目标：从当前概念设计推进到可复现的 MVP、持续回归系统和可信 Benchmark。

## 一页总览

| 阶段 | 核心目标 | 关键交付物 | 里程碑验收 | 预计节奏 |
|---|---|---|---|---|
| **Now：设计闭环** | 冻结可实施的架构、运行和数据契约 | `TECHNICAL_DESIGN.md`、Run 状态机、Task/Result Schema v1、Sandbox/隐藏测试隔离方案、Evaluator/Artifact 接口 | 一个示例 Task 和 Run 能通过设计走查；版本、seed、失败分类、评分门槛和 Artifact 均有唯一语义 | 1 个里程碑 |
| **Next：MVP 闭环** | 跑通单机、单 Agent、单任务的完整评测链路 | TypeScript Monorepo、Docker Sandbox、本地 Runner、Mock Agent、Build/Functional/Visual/A11y Evaluator、Artifact manifest、2→10 个校准任务、最小结果对比 | `pnpm install && pnpm build && pnpm eval run react-orders-filter-017` 成功；固定 seed 可重跑；Agent 看不到隐藏测试；结果可审计复现 | 3 个里程碑 |
| **Later：规模化与 Benchmark** | 将 MVP 扩展为持续回归和公平横评平台 | 40–60 个 Regression Tasks、失败回流、重复运行与 success@k、完整 Dashboard、私有 Holdout、多 Agent Adapter、置信区间、性能/工程/Judge 治理、更多前端生态 | Agent 版本可持续回归；不同 Agent/模型/Harness 在统一预算下可复现比较；任务泄露与 Judge 偏差有治理证据 | 3 个里程碑 |

## 路线图

```text
NOW                                   NEXT                                      LATER

M0 设计与契约                         M1 最小纵向切片                            M4 回归系统
├─ 技术架构                           ├─ task.yaml → Runner                     ├─ 40–60 个任务
├─ Run 状态机                         ├─ Docker Sandbox                        ├─ 真实失败回流
├─ Task/Result Schema v1              ├─ Mock Agent                            ├─ 重复运行 / success@k
├─ 隔离与权限模型                     └─ result.json + Artifact                 └─ 版本回归门禁
└─ Evaluator/Artifact 契约                    │
        │                                    ▼                                  M5 Benchmark
        ▼                              M2 可信评估链                            ├─ 私有 Holdout
                                      ├─ Integrity / Build                    ├─ 多 Agent Adapter
                                      ├─ Functional / Visual / A11y           ├─ 统一预算与环境
                                      ├─ 门槛与失败分类                        └─ 置信区间 / Cost-Quality
                                      └─ 隐藏测试不可见
                                             │                                  M6 平台化扩展
                                             ▼                                  ├─ 完整 Dashboard
                                      M3 数据集与对比                           ├─ Performance / Engineering
                                      ├─ 2 个样板任务 → 10 个校准任务          ├─ Judge 治理
                                      ├─ Gold / Alternative / Mutation         └─ Vue / Angular / Monorepo
                                      └─ 最小结果对比
```

## 里程碑定义

### M0 — 设计与契约冻结（Now）

- Owner：技术设计负责人 + 数据契约负责人。
- 解决的问题：当前设计有完整方向，但缺少可执行的状态、接口、版本、隔离和失败语义。
- 交付范围：推荐技术栈、模块边界、数据库模型、Run 状态机、Worker/Sandbox 生命周期、Agent Adapter、Evaluator、Artifact Store、Aggregator、API、安全与可观测性；严格 Task/Result v1 Schema 和兼容策略。
- 非目标：不在此阶段建设分布式调度、完整 Dashboard 或多框架支持。
- 验收信号：用 `react-orders-filter-017` 完整走查一次创建 Run、执行 Agent、冻结工作区、运行 Evaluator、聚合和保存 Artifact；所有状态与错误均可映射到契约。
- 置信度：High。
- 下一步：`$idea-to-ship:architect --slug frontend-agent-benchmark`。
- 来源：`CODEX_TASK.md`“输出详细技术设计/校验数据模型”；`PLAN.md`“验证流水线/评分模型/MVP 验收标准”。

### M1 — 最小纵向切片（Next）

- Owner：平台实现负责人。
- 解决的问题：验证从任务输入到结构化结果输出的技术路径是否可行。
- 交付范围：TypeScript Monorepo、本地 CLI、单 worker、Docker Sandbox、Mock/命令式 Agent、本地 Artifact Store。
- 非目标：不做 K8s、Firecracker、弹性调度和多租户。
- 验收信号：目标命令跑通并生成 `result.json`、patch、events、commands、trace、screenshots 和 evaluator results；相同 seed 重跑可追踪。
- 依赖：M0。
- 置信度：High。
- 来源：`CODEX_TASK.md`“MVP 工程骨架/完成标准”。

### M2 — 可信评估链（Next）

- Owner：Sandbox/安全负责人 + Evaluator 负责人。
- 解决的问题：确保结果不会因隐藏测试泄露、越权、评分抵消或基础设施误判而失真。
- 交付范围：Integrity、Build、Functional、Visual、A11y 插件流水线；网络/路径/资源预算；Agent 与 evaluator 的进程和挂载隔离；失败分类与短路规则。
- 非目标：LLM/VLM Judge 不验证确定性功能，performance 暂不混入质量总分。
- 验收信号：Agent 无法读取隐藏测试；越权被阻断并审计；Build/关键功能失败不可被其他分数抵消；Infrastructure Error 与 Agent Failure 明确区分。
- 依赖：M0、M1。
- 置信度：High。
- 来源：`PLAN.md`“验证流水线/评分模型”；`diagrams/scoring-flow.mmd`；`CODEX_TASK.md`“约束”。

### M3 — 数据集与最小对比（Next）

- Owner：数据集负责人 + 结果分析负责人。
- 解决的问题：证明验证器能接受不同正确实现并捕获典型错误，且结果能支持基本方案比较。
- 交付范围：先完成 2 个样板任务，再扩到 10 个；每个任务包含 Gold、Alternative、Mutation、公开 Smoke 和隐藏测试；提供 CLI、静态报告或单页对比。
- 非目标：不先建设完整运营 Dashboard。
- 验收信号：Gold/Alternative 通过，Mutation 按预期失败；可按 Agent/模型/Prompt/Harness/版本比较质量、成本、时长和稳定性。
- 依赖：M1、M2。
- 置信度：Medium；10 个任务的建议分布尚缺真实失败频率证据。
- 来源：`PLAN.md`“测试任务设计/验证器自身校准/Phase 1”。

### M4 — Regression 系统（Later）

- Owner：数据集运营负责人。
- 解决的问题：将真实 Bug 和 Agent 历史失败持续转为可版本化回归资产。
- 交付范围：40–60 个任务、回流/去重/校准/发布/弃用流程、重复运行、success@1/any@k/all@k 和版本回归门禁。
- 验收信号：3 个真实失败案例可在约定流程内变成校准任务；Agent 版本变更自动输出回归对比。
- 依赖：M3 的任务模板和可信结果。
- 置信度：Medium。
- 来源：`PLAN.md`“Regression Suite/Phase 2”。

### M5 — 私有 Benchmark（Later）

- Owner：Benchmark 负责人。
- 解决的问题：公平比较不同模型、Prompt、Harness、工具和修复策略组成的完整 Agent 系统。
- 交付范围：私有 Holdout、多 Agent Adapter、统一预算与固定环境、多次运行、置信区间和 Cost/Quality 分析。
- 非目标：未完成反作弊和治理前不做公开排行榜。
- 验收信号：至少两个 Adapter 的盲测结果可复现；Adapter 开销、任务泄露和环境版本均可审计。
- 依赖：M2、M4。
- 置信度：Medium。
- 来源：`PLAN.md`“Benchmark/Phase 3”。

### M6 — 平台化扩展（Later）

- Owner：产品/前端负责人 + Evaluator/生态负责人。
- 解决的问题：支持大规模诊断、更多质量维度和更广泛前端场景。
- 交付范围：完整 Dashboard、失败簇与趋势、Performance/Engineering Evaluator、Judge 版本/偏差/人工抽检治理、Vue/Angular/Monorepo/微前端。
- 验收信号：核心诊断可在界面闭环；非确定性评分有版本和人工相关性证据；新增生态均有独立校准基线。
- 依赖：M4/M5 的真实查询、失败和运行证据。
- 置信度：Low–Medium；具体扩展顺序需由实际失败分布决定。
- 来源：`PLAN.md`“重点评测维度/Phase 2/Phase 3”；`CODEX_TASK.md`“Dashboard 页面结构”。

## 关键决策与边界

1. **先契约，后扩规模**：版本、状态、隔离、评分和 Artifact 语义稳定前，不扩大任务集和 Dashboard。
2. **先纵向切片，后分布式**：MVP 使用本地单 worker + Docker；K8s、Firecracker 和云 Artifact Store 暂缓。
3. **隐藏测试必须不可见**：只读挂载不能满足要求，需进程/挂载边界隔离，并且 evaluator 只在 Agent 停止后运行。
4. **确定性检查优先**：Judge 只处理开放性视觉/设计问题，不替代功能、构建、可访问性等确定性验证。
5. **质量与效率分开**：Cost、Token、Wall Time 和 Tool Calls 独立报告，不直接混入功能质量分。

## 来源与冲突说明

- 纳入：`README.md`、`PLAN.md`、`CODEX_TASK.md`、`diagrams/*.mmd`、`examples/*`、`schemas/*`。
- 排除：外部竞品/市场、用户访谈、Issue/提交/运行日志；当前目录无 Git 历史和实现产物，本次未启用 `--commercial`。
- 冲突处理：隐藏 evaluator 的“只读挂载”提升为“对 Agent 不可见”；完整 Dashboard 后置但 Next 保留最小对比；开放 Schema 收紧核心字段并保留显式扩展；performance 先保留分项、不默认加入总分。

## 优先级审批

建议批准主路径：

```text
M0 设计与契约
  → M1 最小纵向切片
  → M2 可信评估链
  → M3 数据集与最小对比
  → M4 Regression
  → M5 Benchmark
  → M6 平台化扩展
```

批准后的下一步：执行 `$idea-to-ship:architect --slug frontend-agent-benchmark`，完成 M0 的架构方案比较与推荐设计。

### 审批记录

- 日期：2026-07-10
- 决定：批准推荐主路径与 Now / Next / Later 排序。
- 来源：Plannotator 人工审批。
- 审批产物：本文件。
- 下一步：执行 `$idea-to-ship:architect --slug frontend-agent-benchmark`。

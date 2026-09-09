# Frontend Coding Agent 评测系统资料包

本资料包用于交给 Codex 或其他 Coding Agent，继续完善前端 Coding Agent 的评测系统设计与实现。

## 实施规格优先级

当前 MVP 的唯一实施依据按以下顺序读取：

1. `.idea-to-ship/frontend-agent-benchmark/requirements.md`
2. `.idea-to-ship/frontend-agent-benchmark/architecture.md`
3. `.harness-engineering/frontend-agent-benchmark/harness-design.md`
4. `.idea-to-ship/frontend-agent-benchmark/design-review.md`

若与上述已批准产物冲突，`PLAN.md`、`CODEX_TASK.md` 和未被明确引用的历史资料只用于追溯，不得作为实现规格。尤其不得恢复隐藏 Evaluator 只读挂载、API/Dashboard、分布式 Worker 或其他已排除的 MVP 范围。

## 目标

构建一个可重复、可扩展、可回归的前端 Coding Agent 测试平台，评测对象不仅是模型本身，而是：

- 模型
- System Prompt
- 上下文策略
- Agent Harness
- 文件编辑、Shell、浏览器等工具
- 自动纠错与重试策略

## 建议阅读顺序

1. `.idea-to-ship/frontend-agent-benchmark/requirements.md`：已批准需求
2. `.idea-to-ship/frontend-agent-benchmark/architecture.md`：已批准架构
3. `.harness-engineering/frontend-agent-benchmark/harness-design.md`：Harness 契约
4. `.idea-to-ship/frontend-agent-benchmark/design-review.md`：当前评审状态与批准修复
5. `diagrams/architecture.mmd`、`diagrams/run-data-flow.mmd`：canonical 运行图
6. `examples/`、`schemas/`：当前契约夹具与迁移输入
7. `PLAN.md`、`CODEX_TASK.md`：历史概念资料，仅作追溯

## 核心原则

- 确定性问题使用自动测试验证。
- 视觉、设计一致性等开放问题才交给 VLM/LLM Judge。
- 功能正确性优先于视觉与代码风格。
- 每个任务必须可复现、可版本化、可重复运行。
- Benchmark 与 Regression Suite 分开管理。
- 评测结果保留分项向量，不只保留单一总分。

## Run 命令

```bash
pnpm eval run create <task-dir> --seed <n> [--sandbox fake|docker] [--db <path>]
pnpm eval run execute <run-id> --agent mock [--sandbox fake|docker] [--db <path>]
pnpm eval run show <run-id> [--db <path>]
pnpm eval run show --repair <run-id> [--db <path>]
```

`--repair` 从 SQLite 中的 canonical resolved input 原样重建缺失或损坏的
`input.json`。默认数据库为 `runs/eval.sqlite`。
Sandbox 默认为 `fake`；Docker Run 必须在 create 与 execute 时都选择
`--sandbox docker`，以保持记录的 Run input 不可变。

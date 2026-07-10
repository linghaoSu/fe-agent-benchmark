# 给 Codex 的完善任务

你需要基于本资料包，继续完善“前端 Coding Agent 评测系统”。

## 你的工作目标

将当前概念方案完善成可实施的技术设计，并尽可能生成 MVP 工程骨架。

## 优先任务

### 1. 审查当前方案

阅读：

- `PLAN.md`
- `diagrams/*.mmd`
- `examples/*`
- `schemas/*`

检查：

- 模块边界是否合理。
- 数据流是否闭环。
- 是否遗漏任务版本、运行版本和环境版本。
- 隐藏测试是否真正与 Agent 隔离。
- Sandbox 权限模型是否安全。
- 多次运行和随机种子是否可追踪。
- 评分模型是否支持任务级权重与关键门槛。
- Artifact 是否足以复现失败。

### 2. 输出详细技术设计

补充以下内容：

- 推荐技术栈。
- 服务和包划分。
- 数据库表设计。
- Task、Suite、Run、Artifact、Evaluator Result 数据模型。
- Run 状态机。
- Worker 调度和并发模型。
- Sandbox 生命周期。
- Agent Adapter 接口。
- Evaluator 插件接口。
- Artifact Store 接口。
- Result Aggregator 逻辑。
- 失败分类体系。
- API 设计。
- Dashboard 页面结构。
- 安全策略。
- 可观测性设计。

### 3. 完善 Mermaid 图

至少补充：

- 部署架构图。
- Run 状态机。
- Agent Tool Call 数据流。
- Evaluator 插件生命周期。
- Task 发布流程。
- Regression Case 回流流程。
- 数据库 ER 图。
- Artifact 存储关系。

### 4. 生成 MVP 工程骨架

推荐使用 TypeScript Monorepo。

可参考：

```text
apps/
  api/
  worker/
  dashboard/

packages/
  task-schema/
  result-schema/
  coordinator/
  sandbox/
  agent-adapter/
  evaluator-core/
  evaluator-build/
  evaluator-playwright/
  evaluator-visual/
  evaluator-a11y/
```

MVP 至少实现：

- 读取 `task.yaml`。
- 创建本地 Docker Sandbox。
- 将公开任务注入工作区。
- 隐藏 evaluator 只读挂载。
- 执行一个 Mock Agent 或命令式 Agent。
- 运行 Build Evaluator。
- 运行 Playwright Evaluator。
- 输出 `result.json`。
- 保存 Log、Patch、Screenshot 和 Trace。
- 支持 `pnpm eval run <task-id>`。

### 5. 校验数据模型

对 `examples/task.yaml` 和 `examples/result.json`：

- 设计 JSON Schema 或 Zod Schema。
- 增加版本字段。
- 支持向后兼容。
- 为必填字段和枚举添加校验。
- 设计 Task Bundle Checksum。

## 约束

- 不允许让 Agent 访问隐藏测试源文件。
- Evaluator 必须在 Agent 停止后运行。
- 测试执行环境必须固定。
- 不使用 LLM Judge 验证确定性功能。
- 结果必须支持审计和复现。
- 不将成本直接混入功能质量分。
- 必须区分 Infrastructure Error 和 Agent Failure。

## 期望输出

1. `TECHNICAL_DESIGN.md`
2. 完善后的 Mermaid 图
3. 数据库 Schema
4. OpenAPI 草案
5. TypeScript Monorepo 骨架
6. Docker Sandbox 示例
7. 一个完整示例 Task
8. 一个 Mock Agent Run
9. 一次完整 Result 输出
10. 后续迭代 Roadmap

## 完成标准

执行以下命令能够跑通：

```bash
pnpm install
pnpm build
pnpm eval run react-orders-filter-017
```

并生成：

```text
runs/<run-id>/
  result.json
  patch.diff
  agent-events.jsonl
  commands.log
  playwright-trace.zip
  screenshots/
  evaluator-results/
```

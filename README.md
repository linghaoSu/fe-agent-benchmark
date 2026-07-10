# Frontend Coding Agent 评测系统资料包

本资料包用于交给 Codex 或其他 Coding Agent，继续完善前端 Coding Agent 的评测系统设计与实现。

## 目标

构建一个可重复、可扩展、可回归的前端 Coding Agent 测试平台，评测对象不仅是模型本身，而是：

- 模型
- System Prompt
- 上下文策略
- Agent Harness
- 文件编辑、Shell、浏览器等工具
- 自动纠错与重试策略

## 建议阅读顺序

1. `PLAN.md`：总体建设计划
2. `CODEX_TASK.md`：交给 Codex 的完善任务
3. `diagrams/architecture.mmd`：系统架构图
4. `diagrams/run-data-flow.mmd`：单次运行数据流
5. `diagrams/dataset-validation.mmd`：验证数据集结构
6. `diagrams/scoring-flow.mmd`：评分流程
7. `examples/task.yaml`：任务定义示例
8. `examples/result.json`：结果数据示例
9. `schemas/`：建议的数据模型草案

## 核心原则

- 确定性问题使用自动测试验证。
- 视觉、设计一致性等开放问题才交给 VLM/LLM Judge。
- 功能正确性优先于视觉与代码风格。
- 每个任务必须可复现、可版本化、可重复运行。
- Benchmark 与 Regression Suite 分开管理。
- 评测结果保留分项向量，不只保留单一总分。

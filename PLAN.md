# 前端 Coding Agent 评测系统建设计划

> **历史概念输入，非当前实施规格。**  
> 当前 MVP 的范围、安全边界和实现顺序以 `.idea-to-ship/frontend-agent-benchmark/requirements.md`、`architecture.md`、`.harness-engineering/frontend-agent-benchmark/harness-design.md` 与当前 `design-review.md` 为准。本文保留用于追溯愿景与后续阶段，不得覆盖已批准的本地 CLI、host-only hidden Evaluator、默认拒绝网络和非 Dashboard MVP 边界。

## 1. 建设目标

搭建一个面向前端开发场景的 Coding Agent 评测系统，用于：

1. 比较不同模型、Prompt、Agent Harness 和工具链。
2. 验证 Agent 新版本是否发生能力退化。
3. 收集真实失败案例并形成持续回归测试。
4. 分析功能、视觉、响应式、可访问性、工程质量和执行成本。
5. 为 Agent 的上下文策略、浏览器使用、调试与自我修复能力提供数据。

评测对象是完整系统：

```text
模型
+ System Prompt
+ 上下文管理
+ Agent Harness
+ 文件编辑工具
+ Shell 工具
+ 浏览器工具
+ 重试与纠错策略
```

## 2. 两类测试集

### 2.1 Benchmark

用于横向比较不同方案。

要求：

- 固定任务和基础代码版本。
- 固定 Node、浏览器、字体、Locale 和时区。
- 隐藏测试。
- 固定预算。
- 多次重复运行。
- 保留模型和 Harness 版本。

### 2.2 Regression Suite

用于产品迭代回归。

来源：

- 真实线上 Bug。
- Agent 历史失败案例。
- 新增框架或工具能力。
- Benchmark 中暴露出的典型弱点。
- 人工构造的边界与故障场景。

## 3. 重点评测维度

### 3.1 功能正确性

验证：

- 页面是否能正常运行。
- 用户操作是否产生正确状态变化。
- 路由和 URL 状态是否正确。
- 表单、异步请求、错误状态是否正确。
- 刷新、返回、重试、重复操作是否正常。
- 是否存在竞态、状态污染或缓存错误。

主要工具：

- Playwright
- 单元测试
- 组件测试
- Mock Server
- Network Assertion

### 3.2 视觉与响应式

验证：

- 页面布局与参考图是否一致。
- 关键元素的位置、尺寸和间距。
- 不同 Viewport 下是否溢出、遮挡或错位。
- Hover、Loading、Error、Modal 等状态。
- DOM 几何与截图结果。

主要工具：

- Playwright Screenshot
- Pixel Diff
- 感知相似度
- DOM Bounding Box
- VLM Judge，仅用于开放性视觉判断

### 3.3 工程正确性

验证：

- Install、Typecheck、Lint、Test、Build、Start。
- 是否破坏已有测试。
- 是否修改禁止目录。
- 是否绕过组件库。
- 是否引入不必要依赖。
- 是否产生大面积无关改动。
- 是否硬编码测试数据。

### 3.4 可访问性

验证：

- axe 扫描。
- ARIA Tree。
- 键盘操作。
- Focus Trap 和 Focus Restore。
- Label、Role、Accessible Name。
- Error Message 关联。

### 3.5 性能

验证：

- Bundle Size。
- 请求数量。
- 重复请求。
- 长任务。
- 页面启动时间。
- 输入响应时间。
- 大列表性能。

### 3.6 Agent 可靠性与效率

采集：

- success@1
- success-any@k
- success-all@k
- Token
- Tool Calls
- Wall Time
- Cost
- Agent 自测次数
- 失败后修复次数
- 完整操作轨迹

## 4. 测试任务设计

首版建议覆盖：

- 30% 新功能开发
- 25% Bug 修复
- 15% 视觉和响应式修复
- 10% 状态和异步交互
- 10% 可访问性和性能
- 10% 重构和迁移

每个任务应包含：

- 公开需求说明。
- 初始代码仓库和 Commit。
- 公开 Smoke Test。
- 隐藏功能测试。
- 视觉基线。
- 响应式 Viewport。
- 可访问性规则。
- 性能预算。
- 工程约束。
- 参考实现。
- 至少一个替代正确实现。
- Mutation 故障样本。
- 评分规则。

## 5. 任务难度模型

难度不只看代码量，应综合：

- 修改文件范围。
- 代码库规模。
- 交互步骤数量。
- 异步和状态复杂度。
- 数据与 API 复杂度。
- 视觉复杂度。
- 响应式要求。
- 是否必须复用设计系统。
- Bug 定位难度。
- 是否存在错误环境或损坏代码。
- 是否需要跨页面、跨包修改。

## 6. 验证流水线

推荐顺序：

```text
完整性与反作弊
→ 依赖安装
→ Typecheck
→ Lint
→ 原有测试
→ Production Build
→ 启动服务
→ Hidden Playwright Tests
→ Visual Tests
→ Responsive Tests
→ Accessibility Tests
→ Performance Tests
→ Engineering Checks
→ Judge
→ 结果聚合
```

关键原则：

- 测试被修改，直接记为 Invalid。
- 构建失败，不进入后续质量评分。
- 关键功能失败，不允许视觉分抵消。
- Judge 不能替代确定性功能测试。

## 7. 评分模型

建议保留完整分项：

```json
{
  "valid": true,
  "solved": true,
  "scores": {
    "build": 1,
    "functional": 0.94,
    "visual": 0.82,
    "responsive": 0.88,
    "accessibility": 0.76,
    "engineering": 0.85
  },
  "efficiency": {
    "tokens": 205500,
    "toolCalls": 64,
    "wallTimeSeconds": 487,
    "costUsd": 1.84
  }
}
```

可选总分：

```text
quality =
  0.50 × functional
+ 0.20 × visual
+ 0.10 × responsive
+ 0.10 × accessibility
+ 0.10 × engineering
```

必须设置门槛：

```text
valid =
  未修改验证器
  AND 未违反权限
  AND 环境可运行

solved =
  valid
  AND build_pass
  AND critical_functional_pass
  AND functional_score >= threshold
```

## 8. 验证器自身校准

### Reference Solution

每个任务至少有一个标准实现。

### Alternative Solution

准备结构不同、但行为正确的实现，避免测试绑定具体 DOM 或代码结构。

### Mutation Testing

注入典型故障：

- 删除 Handler。
- 修改 API 参数。
- 破坏响应式。
- 删除 ARIA。
- 制造旧请求覆盖新请求。
- 删除 Error State。
- 添加溢出或遮挡。
- 修改路由同步逻辑。

验证器必须能捕获这些故障。

### 人工抽检

定期抽样，由前端工程师检查：

- 自动成功但实际失败。
- 自动失败但实现可接受。
- 视觉分和人工排序是否一致。
- Judge 是否存在模型偏见。

## 9. 首版实施范围

### Phase 1：MVP

- React + TypeScript + Vite。
- Docker Sandbox。
- Chromium。
- Playwright。
- Mock API。
- 10 个任务。
- Build、Functional、Visual、A11y 四类验证。
- 保存 Patch、Log、Screenshot 和 Trace。

### Phase 2：回归系统

- 扩展到 40～60 个任务。
- 加入真实 Bug 和历史失败案例。
- 支持重复运行。
- Dashboard。
- 失败分类。
- Agent、模型和 Prompt 版本对比。

### Phase 3：Benchmark

- 私有 Holdout。
- 多 Harness Adapter。
- 多模型。
- 统一预算。
- 置信区间。
- Cost / Quality 分析。
- Vue、Angular、Monorepo 和微前端场景。

## 10. 推荐代码模块

```text
apps/
  api/
  dashboard/
  worker/

packages/
  task-schema/
  run-coordinator/
  sandbox-runtime/
  agent-adapters/
  evaluator-core/
  evaluator-integrity/
  evaluator-build/
  evaluator-functional/
  evaluator-visual/
  evaluator-a11y/
  evaluator-performance/
  evaluator-engineering/
  result-schema/
  artifact-store/

datasets/
  tasks/
  suites/
  schemas/
```

## 11. MVP 验收标准

系统至少能够：

1. 加载版本化任务。
2. 创建隔离 Sandbox。
3. 启动任意 Agent Adapter。
4. 限制网络、路径和预算。
5. 保存完整 Agent 操作轨迹。
6. 执行隐藏 Playwright 测试。
7. 生成视觉差异和 Trace。
8. 运行 axe。
9. 输出结构化 Result JSON。
10. 支持相同任务重复运行。
11. 展示不同 Agent 的结果差异。
12. 将新失败案例转化为 Regression Task。

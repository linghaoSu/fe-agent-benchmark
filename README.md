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
- 沙箱不再隔离网络：任务声明 `environment.network: open` 时允许外网访问（全部 10 个数据集任务），
  依赖来自真实 npm registry 并由 lockfile integrity 锁定；`controlled-proxy` 模式仍保留给离线任务。

## 当前状态（2026-09-11）

V0–V6 已实现：合同与 Schema、SQLite Run/Attempt 状态机、Adapter stdio 协议与 Mock Adapter、
Tool Router、Docker 沙箱（每 Attempt 独立网络、阶段屏障、不可变快照；`controlled-proxy` 模式下默认拒绝网络并走受控依赖代理）、
Integrity / Build / Start / 隐藏 Playwright 功能 / 视觉 / 响应式 / 可访问性 / 工程 评测器、
Gold / Alternative / Mutation 校准、确定性重复比较、seed 批次与 success@k 对比、
Suite 发布门禁，以及 10 个已校准任务（`datasets/tasks/`，D8 分布，`datasets/suites/mvp-regression.json`）。

V7.1：第一个真实 Agent Adapter（`packages/adapter-opencode`，通过 OpenCode CLI 接任意 provider/model），
已用 `rundao/public/kimi-k3` 在 react-orders-filter-017 上跑出 solved=true。

V7.2：沙箱开放网络。`environment.network: open` 的任务在非 internal 的每 Attempt 网络中运行，不再有依赖代理与
依赖缓存快照；10 个数据集任务已全部切换为 `open`。`controlled-proxy` 继续服务 `tests/fixtures` 中的离线任务。

## 环境要求

- Node 26（使用 `node:sqlite`）、pnpm 10。
- Docker（OrbStack 或 Docker Desktop）。沙箱镜像按 digest 固定：
  `node:22-alpine@sha256:16e22a55…` 与 `mcr.microsoft.com/playwright:v1.59.1-noble@sha256:b0ab6f3c…`；
  若被本地清理，`docker pull <ref@digest>` 即可（Run 会以 `SANDBOX_IMAGE_UNAVAILABLE` 明确失败）。
- 网络：`environment.network: open` 的任务（全部数据集任务）在沙箱内可访问外网，`npm ci` 直接从真实
  npm registry 安装，并依赖 lockfile 的 integrity 锁定版本与内容；结果只在相同网络模式的 Run 之间可比。
  `controlled-proxy` 任务仍完全离线，npm 包来自 `tests/fixtures/package-proxy/tarballs`。
- 浏览器库始终从 `tests/fixtures/playwright-runtime` 挂载，两种模式都不会在沙箱内下载浏览器。

## 快速开始

```bash
pnpm install && pnpm build
node --test --test-concurrency=1 tests/gate/*.test.mjs   # 全部门禁（含真实 Docker，约 25 分钟）

# 一次完整评测：Gold 参考实现通过整条流水线
pnpm eval run create datasets/tasks/react-orders-filter-017 --seed 7 --sandbox docker
pnpm eval run execute <run-id> --agent mock --mock-scenario reference:gold --sandbox docker
pnpm eval run show <run-id>                    # Result、Attempt、评测器结果、Artifact
pnpm eval run export --audience requester <run-id>

# 真实 Agent（OpenCode，需本机已安装并配置好 provider；API key 只存在于 ~/.config/opencode，不进入仓库或 Artifact）
pnpm eval run create datasets/tasks/react-orders-filter-017 --seed 1 --sandbox docker --budget-profile agent
pnpm eval run execute <run-id> --agent opencode --model rundao/public/kimi-k3 --sandbox docker

# 校准一个任务：gold + alternative + 全部 mutation 必须符合各自 expected.json
pnpm eval calibrate datasets/tasks/react-orders-filter-017 --out reports/react-orders-filter-017.json

# 确定性：同一输入重复 N 次，结论必须完全一致
pnpm eval repeat datasets/tasks/react-orders-filter-017 --times 3

# 多 seed 独立 Run 与 success@k 对比
pnpm eval batch datasets/tasks/react-orders-filter-017 --seeds 1,2,3 --scenario reference:gold --configuration gold --db runs/cmp.sqlite
pnpm eval batch datasets/tasks/react-orders-filter-017 --seeds 1,2,3 --scenario react-orders-noop --configuration noop --db runs/cmp.sqlite
pnpm eval compare --config gold=<ids> --config noop=<ids> --k 3 --out report.json --db runs/cmp.sqlite

# 发布 Suite（要求每个任务有与 bundle checksum 绑定且通过的校准报告）
pnpm eval suite publish --id mvp-regression --version 4 --type regression --task datasets/tasks/<id> ... \
  --calibration datasets/calibration --out datasets/suites/mvp-regression.json
pnpm eval suite calibrate --suite datasets/suites/mvp-regression.json --tasks-root datasets/tasks
```

## 新增任务

```bash
node scripts/scaffold-task.mjs <task-id> "<标题>" <feature|bugfix|visual|async|accessibility|refactor>
```

然后补齐 `README.md`、`src/`（起始代码）、`tests/`（公开 smoke test）、`evaluator/hidden/functional.spec.mjs`
（隐藏 Playwright 用例，`export default [{ id, critical, run(page) }]`）、`references/gold`、
`references/alternative`（结构不同的正确实现）、`references/mutations/<name>`（每个恰好一个缺陷）——
每个 reference 都需要 `expected.json`。用 `pnpm eval baseline <task>` 生成视觉基线，
`pnpm eval calibrate <task>` 必须 100% 捕获 mutation 后才能进入 Suite。
`evaluator/` 与 `references/` 对 Agent 不可见；公开文件中不得出现隐藏断言文本（发布门禁会拒绝）。

## Run 命令

```bash
pnpm eval run create <task-dir> --seed <n> [--sandbox fake|docker] [--budget-profile task|agent] [--db <path>]
pnpm eval run execute <run-id> --agent mock [--mock-scenario <s>] [--sandbox fake|docker] [--db <path>]
pnpm eval run execute <run-id> --agent opencode --model <provider/model> [--variant <v>] --sandbox docker [--db <path>]
```

`--budget-profile agent` 放宽 Task 为 Mock 设定的预算（墙钟 ≥900s、步数 ≥200、成本 ≥$5、工具输出 32 MiB），并记录进不可变的 Run 输入，
只有相同 profile 的 Run 可比。OpenCode Adapter 把公开工作区经 Tool Router 镜像到宿主临时目录、运行真实 Agent、再把所有改动经
`write_file`/`run_command` 回放进沙箱——补丁与评测始终以沙箱为准；已知限制：Agent 自己的 shell 自检在宿主副本上执行，不在沙箱内。

```bash
pnpm eval run show <run-id> [--db <path>]
pnpm eval run show --repair <run-id> [--db <path>]
```

## React orders quick start

```bash
pnpm eval run create datasets/tasks/react-orders-filter-017 --seed 7 --sandbox docker
pnpm eval run execute <run-id> --agent mock --mock-scenario react-orders-gold --sandbox docker
pnpm eval run show <run-id>
pnpm eval run export --audience requester <run-id>
```

`--repair` 从 SQLite 中的 canonical resolved input 原样重建缺失或损坏的
`input.json`。默认数据库为 `runs/eval.sqlite`。
Sandbox 默认为 `fake`；Docker Run 必须在 create 与 execute 时都选择
`--sandbox docker`，以保持记录的 Run input 不可变。

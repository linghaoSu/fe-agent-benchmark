# 待办完成状态切换 Bug 修复

待办列表页（`src/app.js`，数据来自 `src/data/todos.js`，共 6 项、其中 2 项已完成）存在多处 Bug，请修复。

## 现象（Bug 报告）

- 把筛选切到「未完成」后勾选某一项，被标记为完成的往往是另一项（例如勾选第 3 行时列表里的第 1、2 行之一被改动）；切回「全部」后才发现改错了。
- 顶部「剩余 N 项」数字与实际不符：初始应显示「剩余 4 项」，却显示「剩余 2 项」，勾选后数字方向也反了。
- 已完成的行没有任何完成态标记：勾选框状态与数据不同步，行上也没有 `data-completed` 属性，切换筛选后勾选框的勾会丢失。

## 期望行为

- 勾选/取消勾选一行的复选框（`data-testid="todo-toggle"`）只切换**该行对应 id** 的待办，无论当前筛选是什么；不要原地修改共享数组，应通过 React state 更新。
- `data-testid="remaining-count"` 显示未完成数量，格式为「剩余 N 项」，每次切换后立即更新。
- 每一行 `data-testid="todo-row"` 带 `data-completed="true"|"false"`，复选框的 `checked` 状态与待办的 `completed` 一致（受控组件），并保持 `aria-checked` 语义（原生 checkbox 的 checked 即可）。
- 筛选下拉框 `data-testid="todo-filter"`，选项值为 `all` / `active` / `completed`：「未完成」只显示未完成项，「已完成」只显示已完成项，且刚切换完成的项会立即出现/消失在对应筛选中。
- 连续切换两次同一项应恢复原状（数量与行状态均恢复）。
- 所有表单控件需有可访问名称（`aria-label` 或 `<label>`），375px 宽度下不出现横向滚动。

不要修改依赖、`evaluator/` 或 `references/`。

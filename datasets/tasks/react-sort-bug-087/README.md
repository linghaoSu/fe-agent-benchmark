# 表格排序不稳定 Bug 修复

员工表格支持点击列头排序，但当前实现存在多个排序缺陷，请修复。

- 点击列头（姓名 / 部门 / 薪资）按该列升序排序，再次点击同一列切换为降序；点击其他列则从升序重新开始。
- 排序不得修改 `src/data/employees.js` 导出的源数组（不能原地 `sort`），任意顺序切换列后数据仍为 10 行，且再次点击姓名应恢复按姓名升序。
- 薪资必须按数值比较（900 应排在 12000 之前），不能按字符串比较；薪资单元格显示纯数字。
- 排序必须稳定：部门相同的员工无论升序还是降序都保持源数据中的相对顺序（可回退到原始下标比较）。
- 当前排序列的表头需要带有正确的 `aria-sort`（`ascending` / `descending`），其他列不应声明为已排序；列头应为带可访问名称的按钮。

测试会使用以下 `data-testid`：`sort-name`、`sort-department`、`sort-salary`（列头按钮）、`sort-indicator`（当前排序方向指示，仅当前列存在一个）、`employee-row`（每一行）以及行内单元格 `employee-name`、`employee-department`、`employee-salary`。

不要修改依赖、`evaluator/` 或 `references/`。

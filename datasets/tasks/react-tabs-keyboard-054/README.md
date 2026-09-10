# 标签页组件键盘可访问性

设置页面的标签栏目前只是一组可点击的 `<div>`，没有语义角色、键盘操作和焦点管理。请按照 WAI-ARIA Tabs 模式改造它。

- 标签容器使用 `role="tablist"` 并带有 `aria-label`。
- 每个标签使用 `role="tab"`，带有 `id`、`aria-selected`（当前标签为 `"true"`，其余为 `"false"`）、指向面板 `id` 的 `aria-controls`；当前标签 `tabindex="0"`，其余标签 `tabindex="-1"`。
- 面板使用 `role="tabpanel"`，`aria-labelledby` 指向当前标签的 `id`，内容为当前标签对应的 `panel` 文本。
- 点击标签选中它并更新面板内容。
- 焦点位于标签上时：`ArrowRight` / `ArrowLeft` 同时移动焦点（`document.activeElement`）和选中状态，并在首尾之间循环；`Home` / `End` 跳到第一个 / 最后一个标签；`Enter` / `Space` 激活当前焦点所在的标签。
- 数据来自 `src/data/tabs.js`（`id`、`label`、`panel`）。

测试会使用以下 `data-testid`：`tab-strip`（标签容器）、`tab`（每个标签）、`tab-panel`（面板，页面上只有一个）。

不要修改依赖、`evaluator/` 或 `references/`。

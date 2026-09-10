# 类式状态逻辑重构为 Hook

当前仪表盘（计数器 + 笔记）功能完全正常，但状态放在 `src/store.js` 的手写单例（`subscribe/getState/setState`）中，`src/app.js` 通过 `useEffect` 订阅并 `forceUpdate` 触发渲染。请在**不改变任何行为**的前提下完成重构。

- 新建 `src/hooks/useDashboard.js`，导出自定义 Hook `useDashboard`，内部基于 `React.useReducer` 管理状态；`src/app.js` 改为使用该 Hook。
- 删除 `src/store.js`，代码中不得再有模块级可变状态。
- `src/reducer.js` 必须保持纯函数，并在 `tests/` 中保留/补充单元测试。
- 行为必须与现状一致：
  - 点击“加一”计数 +1，点击“重置”计数归零；
  - 在文本框输入内容后点击“添加笔记”，列表新增一条，笔记数量同步更新，文本框清空；
  - 空白内容（含仅空格）不得添加。
- 页面元素与 `data-testid` 保持不变：`count`、`increment`、`reset`、`note-input`、`add-note`、`note-item`、`note-count`。
- 所有按钮与文本框需有可访问名称（可见文本、`<label>` 或 `aria-label`），375px 宽度下不得出现横向滚动。
- 工程要求：不要留下 `console.log` 或其它调试残留，本次变更涉及的文件数不超过 12 个。

不要修改依赖、`evaluator/` 或 `references/`。

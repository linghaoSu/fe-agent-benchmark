# 异步搜索去抖与竞态

修复并完善用户搜索框的异步行为。当前实现每次按键都会发起请求，并直接渲染最后返回的结果；由于 `src/api/searchUsers.js` 中较短的查询返回更慢，快速输入会显示过期结果。

- 搜索框 `[data-testid=search-input]` 按姓名或邮箱（不区分大小写）匹配 `src/data/users.js` 中的 12 位用户，匹配由 `searchUsers(query)` 完成。
- 输入需要去抖 150ms：停止输入 150ms 后才发起请求。
- 必须忽略过期响应：只有最新一次查询的结果可以渲染（可使用请求序号或 `AbortController`，`searchUsers(query, { signal })` 支持中止）。
- 请求进行中显示 `[data-testid=loading-state]`，完成后移除。
- 结果每行渲染为 `[data-testid=user-row]`，并用 `[data-testid=result-count]` 显示当前结果数量。
- 搜索完成且无匹配时显示 `[data-testid=empty-state]`；输入为空时显示全部 12 位用户。
- 搜索框需要可访问名称（`aria-label` 或 `<label>`）。

不要修改 `src/api/searchUsers.js` 的延迟与匹配逻辑，不要修改依赖、`evaluator/` 或 `references/`。

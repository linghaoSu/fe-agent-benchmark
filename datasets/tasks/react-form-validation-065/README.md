# 注册表单校验与错误提示

为注册表单实现提交时校验与错误提示。

- 新建纯函数模块 `src/validate.js`，导出 `validateForm(values)`，返回 `{ username?, email?, password?, confirm? }` 形式的错误对象（无错误的字段不出现），错误信息为中文。规则：
  - 用户名：3–16 个字符，仅允许字母、数字、下划线。
  - 邮箱：仅包含一个 `@`，且 `@` 后的域名部分包含 `.`。
  - 密码：至少 8 个字符，且同时包含字母和数字。
  - 确认密码：必须与密码一致。
- 点击提交（`[data-testid=submit]`）时对全部字段校验；每个无效字段在其输入框下方显示错误文本，元素为 `[data-testid=error-<字段名>]`（如 `error-email`），并通过 `aria-describedby` 关联到对应输入框，同时输入框标记 `aria-invalid="true"`。有效字段不渲染错误元素，也不带 `aria-invalid="true"`。
- 全部字段有效时，进入约 100ms 的模拟提交，期间提交按钮禁用以防止重复提交；完成后 `[data-testid=form-status]` 显示「提交成功」。存在任何错误时 `form-status` 不得显示「提交成功」。
- 修正后再次提交时，已变为有效的字段错误必须清除。
- 每个输入框都要有 `<label for>` 关联的可访问名称。
- 输入框的 `data-testid` 分别为 `username`、`email`、`password`、`confirm`；不要改动这些 testid。

不要修改依赖、`evaluator/` 或 `references/`。

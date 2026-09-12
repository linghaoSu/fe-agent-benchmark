# 创建云原生网关 API（三步表单）

本仓库是一个基于 DAO 前端脚手架（Vue 3 + TypeScript + rsbuild + `@dao-style/core` / `@dao-style/extend`）的网关管理前端。请在其中实现「创建云原生网关 API」页面：一个三步的创建表单，设计稿见 `design/`（`step1.png` / `step2.png` / `step3.png`，以及从 Sketch 导出的图层规格 `spec.json`）。

- 路由：`/apis/create`；访问 `/` 时应到达同一页面（重定向或同组件均可）。
- 不需要真实接口：点击「确定」后在页面内展示提交结果（见下文「提交结果」）。
- 请使用 `@dao-style/core` 的表单组件（`DaoForm` / `DaoFormItem` / `DaoInput` / `DaoSelect` / `DaoRadio` / `DaoSwitch` / `DaoCheckbox` / `DaoButton` 等）与项目已有的样式变量，尽量贴近设计稿的布局：左侧固定宽度标签列（约 160px）、分卡片的白色内容区、蓝色信息条、虚线的目标服务配置框。设计稿为桌面稿，页面在 375px 宽度下应纵向堆叠，不出现横向滚动。
- 校验可以用 vee-validate + yup（脚手架已带依赖，`@dao-style/extend` 提供 `registerAllValidations`），也可以自行实现；评估只关注行为。
- 只允许修改 `src/**` 与 `tests/**`；不要改动依赖、`evaluator/`、`references/`。请保持 `pnpm run lint:type`、`pnpm run lint:es`、`pnpm exec vitest run`、`pnpm run build` 全部通过（`tests/unit` 下保留至少一个单元测试）。

## 页面结构

页头：返回箭头 + 标题「创建云原生网关 API」。

步骤指示器（`data-testid="step-indicator"`）：三步，文案依次为 **基本信息**、**策略配置(选填)**、**安全配置(选填)**；当前步骤高亮，已完成步骤显示对勾。可用 `@dao-style/extend` 的 `DaoStepper`。

页脚按钮（右对齐）：

| 步骤 | 按钮 |
| --- | --- |
| 第一步 | 取消、下一步 |
| 第二步 | 取消、上一步、下一步 |
| 第三步 | 取消、上一步、确定 |

- **下一步**：校验当前步骤，全部通过才进入下一步；否则停留在当前步骤，在对应字段下方显示错误文案。
- **上一步**：不校验，直接返回，并且**保留**所有已填写的内容（包括后面步骤已填的内容）。
- **取消**：重置整个表单回到第一步。
- **确定**：校验全部三步；有错误时跳回第一个存在错误的步骤并显示错误；全部通过则进入提交结果状态。

三个步骤各自的内容容器分别带 `data-testid="step-panel-1"`、`step-panel-2`、`step-panel-3`；同一时刻只渲染当前步骤的容器。

## 第一步：基本信息

### 基本信息

| 字段 | 要求 |
| --- | --- |
| API 名称（必填） | 单行输入。规则：`^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$`，长度不超过 63。字段下方常驻提示文案：「包含小写字母、数字和以及特殊字符(- .)，且不能以特殊字符开头和结尾，长度 63，创建后不可更改」。 |
| API 分组（必填） | 下拉选择，候选项固定为 `default`、`payments`、`search`；支持输入一个不存在的名称并「创建」为新分组（创建后即被选中）。提示文案：「由名称检索下拉选取，分组名称不存在时可创建」。 |
| 关联域名（必填） | 多选下拉，候选项固定为 `api.example.com`、`gw.example.com`；右侧有一个「添加域名」链接（仅展示，不需要跳转）。 |

### 匹配规则

| 字段 | 要求 |
| --- | --- |
| 路径（必填） | 左侧匹配方式下拉：前缀匹配（默认）/ 精确匹配 / 正则匹配，对应值 `prefix` / `exact` / `regex`；右侧路径输入框，必须以 `/` 开头。 |
| 请求方法（必填） | 多选：`GET` `POST` `PUT` `DELETE` `PATCH`。 |

### 路由配置

可折叠的「路由配置 01 / 02 / …」卡片列表（每张卡片 `data-testid="route-card"`），至少保留一条，可通过「添加路由配置」（`btn-add-route`）新增、通过卡片右上角的 × 删除（只剩一条时不可删）。每张卡片包含：

- **请求头**：可增删的行，每行「Header 关键字 / 判断条件（等于 `equal`、前缀 `prefix`、正则 `regex`）/ 对应值」，默认没有行；「添加参数」新增一行。
- **参数匹配**：同上结构。
- **目标服务（必填）**：先展示信息条「「策略配置」、「安全配置」仅对「后端服务」生效。」，然后是单选（`data-testid="route-target"`）：**后端服务**（默认，值 `service`）/ **重定向**（`redirect`）/ **直接返回**（`direct`）。三种取值下方各自的配置区：
  - 后端服务：
    - 「平台自动分配权重」开关（`auto-weight`），默认关闭；下方警示文案「开启后会清空已完成的权重配置，请谨慎操作！」。开启后所有服务的权重输入框被禁用且权重清空、不再校验权重。
    - 服务列表（每项 `data-testid="service-row"`），默认一项，「添加服务」（`btn-add-service`）新增、右侧 ⊖ 删除（至少保留一项）。每项包含：**服务名称**（必填，下拉，候选项固定为 `order-svc`、`user-svc`、`search-svc`）、**权重**（`service-weight`，数字输入，未开启自动分配时必填且为 1–100 的整数）、**流量镜像**开关（默认关闭），下方提示「流量镜像选取的服务将不再参与负载均衡，但会收到全部的流量请求」。
    - 未开启自动分配权重时，同一路由内所有服务权重之和必须为 100，否则显示错误「权重之和必须为 100」。
  - 重定向：**目标地址**（`redirect-url`，必填，必须是 `http://` 或 `https://` 开头的 URL）。
  - 直接返回：**状态码**（`direct-status`，必填，100–599 的整数）、**响应体**（`direct-body`，多行文本，可选）。

## 第二步：策略配置(选填)

顶部信息条「仅针对后端服务有效」（`policy-banner`）。当第一步没有任何路由选择「后端服务」时，该信息条及下方表单以置灰/弱化的样式呈现（仍可操作）。

| 字段 | 要求 |
| --- | --- |
| 负载均衡 | 单选（`lb-mode`）：轮询 `roundRobin`（默认）/ 随机 `random` / 权重 `weighted` / Cookie `cookie` / 请求 Hash `requestHash`。选择「请求 Hash」时展开：提示「选择使用请求哈希作负载均衡时，以下策略必须启用一个」；**哈希请求头或请求参数**开关（`hash-header-switch`），开启后出现可增删的行「哈希策略（请求头 `header` / 请求参数 `query`）/ 关键字（必填）/ 匹配终止（关闭 / 开启）」；**哈希来源 IP** 开关（`hash-ip-switch`）。两者必须至少开启一个，否则下一步时显示错误「选择使用请求哈希作负载均衡时，以下策略必须启用一个」。 |
| 路径改写 | 开关（`rewrite-switch`）；开启后 **原路径**（`rewrite-from`，必填）、**重写路径**（`rewrite-to`，必填，占位「示例：/blog02」）。 |
| 超时配置 | 开关（`timeout-switch`）；开启后 **超时时长**（`timeout-minutes`，数字，单位分钟，必填，取值 1–5）。超过 5 时显示错误「超时时长配置，最长只支持配置 5 分钟。」。 |
| 重试机制 | 开关（`retry-switch`）；开启后 **重试次数**（`retry-count`，必填，≥ 1 的整数）、**重试超时时长**（分钟，可选）、**HTTP 重试条件** 多选框：5XX `5xx` / 网关错误 `gateway-error` / 请求重置 `reset` / 连接失败 `connect-failure`、**HTTP 重试状态码**（可输入自定义状态码并「添加」为标签，可删除）、**GRPC 重试条件** 多选框：请求被取消 `cancelled` / 响应超时 `deadline-exceeded` / 服务内部错误 `internal` / 资源不足 `resource-exhausted` / 服务不可用 `unavailable`。 |
| 请求头重写 | 开关；开启后可增删的行「动作（添加 `add` / 覆盖 `set` / 删除 `remove`）/ 关键字 / 值」。 |
| 响应头重写 | 同上。 |
| Websocket | 开关。 |
| 本地限流 | 开关（`ratelimit-switch`）；开启后 **请求速率**（`ratelimit-rps`，必填，≥ 1 的整数，提示「输入最小数值为 1 的正整数」）、**时间窗口**（秒 `second`（默认）/ 分钟 `minute`）、**允许溢出速率**（≥ 0 的整数，默认 0，提示「输入最小数值为 0 的整数，默认为 0，不开启」）、**限制返回码**（下拉：429（默认）/ 403 / 503）、**Header** 键值行（可增删）。 |
| 健康检查 | 开关。 |
| Cookie 重写 | 开关；开启后可增删的 Cookie 项，每项「名称（必填）/ 域名 / 路径 / Secure / SameSite」。 |
| 访问黑白名单 | 单选：应用域名配置 `domain`（默认）/ 允许 `allow` / 拒绝 `deny`；选中「应用域名配置」时下方显示信息条「当前 API 关联的域名，已启用了对应 访问黑白名单 允许 策略。」。 |

所有开关默认关闭；关闭的开关对应的子字段不参与校验。

## 第三步：安全配置(选填)

顶部信息条「仅针对后端服务有效」（`security-banner`），置灰规则同第二步。

| 字段 | 要求 |
| --- | --- |
| JWT 认证 | 单选（`jwt-mode`）：应用域名配置 `domain`（默认）/ 不启用 `disabled`。选中「应用域名配置」时显示信息条「当前 API 关联的域名，已启用 JWT 认证。」。 |
| 安全认证 | 单选（`auth-mode`）：应用域名配置 `domain`（默认）/ 跳过鉴权 `skip`。选中「应用域名配置」时显示信息条「当前 API 关联的域名，已启用安全认证。」。下方是 **附加参数** 键值行（每行 `extra-param-row`，「添加」按钮 `btn-add-extra-param`，可删除），默认无行。 |

## 提交结果

「确定」校验通过后，用结果面板替换整个表单与页脚。结果面板 `data-testid="create-result"` 内包含成功提示，以及整份表单数据按下述结构序列化、`JSON.stringify(payload, null, 2)` 美化后的 JSON 文本（放在 `<pre>` 中，`data-testid="create-result-json"`）。面板内除该 JSON 外不要再出现其它 `{`/`}` 字符。

```ts
{
  name: string,
  group: string,
  domains: string[],
  match: { pathType: 'prefix' | 'exact' | 'regex', path: string, methods: string[] },
  routes: Array<{
    headers: Array<{ key, operator, value }>,   // 只包含关键字非空的行
    params: Array<{ key, operator, value }>,
    target: 'service' | 'redirect' | 'direct',
    // target === 'service' 时：
    autoWeight?: boolean,
    services?: Array<{ name: string, weight: number | null, mirror: boolean }>, // autoWeight 时 weight 为 null
    // target === 'redirect' 时：
    redirectUrl?: string,
    // target === 'direct' 时：
    directStatus?: number | null, directBody?: string,
  }>,
  policy: {
    lbMode: string,
    hash?: { byHeader: boolean, rows: Array<{ source, key, terminal: boolean }>, byIp: boolean }, // 仅 lbMode === 'requestHash'
    rewrite: { enabled: false } | { enabled: true, from, to },
    timeout: { enabled: false } | { enabled: true, minutes: number },
    retry: { enabled: false } | { enabled: true, count, timeoutMinutes: number | null, httpConditions: string[], httpStatusCodes: string[], grpcConditions: string[] },
    requestHeaders: { enabled: false } | { enabled: true, rows: Array<{ action, key, value }> },
    responseHeaders: { enabled: false } | { enabled: true, rows: Array<{ action, key, value }> },
    websocket: boolean,
    rateLimit: { enabled: false } | { enabled: true, rps, window, burst, status, headers: Array<{ key, value }> },
    healthCheck: boolean,
    cookieRewrite: { enabled: false } | { enabled: true, cookies: Array<{ name, domain, path, secure, sameSite }> },
    accessMode: string,
  },
  security: { jwtMode: string, authMode: string, extraParams: Array<{ key, value }> },
}
```

规则：未启用的开关输出 `{ enabled: false }`；键值型行只输出关键字（`key` / `name`）非空的行；`hash` 仅在 `lbMode === 'requestHash'` 时出现（`byHeader` 关闭时 `rows` 为 `[]`）；`weight`、`minutes` 等数字字段输出数字类型。

## 错误提示与可访问性

- 每个校验失败的字段在其下方显示一段错误文案，元素带 `data-testid="error-<字段>"`（第一步：`error-name`、`error-group`、`error-domains`、`error-path`、`error-methods`；第二步策略字段使用 `error-policy.<字段>`，如 `error-policy.timeoutMinutes`、`error-policy.retryCount`、`error-policy.rateLimitRps`、`error-policy.hash`），并且对应的 `<input>` 上 `aria-invalid="true"`、`aria-describedby` 指向该错误元素的 `id`。校验通过后错误消失、`aria-invalid="false"`。
- 所有输入控件都要有可访问名称（`<label for>`、`aria-label` 或 `aria-labelledby`）；开关请用 `role="switch"` + `aria-checked`（或原生 checkbox）；单选组容器带 `role="radiogroup"`。所有仅装饰的图标 `aria-hidden="true"`。
- 文字颜色需满足 WCAG AA 对比度（组件库默认的辅助文字/占位符颜色偏浅，需要加深）。

## 必需的 `data-testid` 一览

`step-indicator`、`step-panel-1`、`step-panel-2`、`step-panel-3`、`btn-prev`、`btn-next`、`btn-submit`、`btn-cancel`、`field-name`、`field-group`、`field-domains`、`field-path-type`、`field-path`、`field-methods`、`route-card`、`btn-add-route`、`route-target`、`service-row`、`service-name`、`service-weight`、`btn-add-service`、`auto-weight`、`redirect-url`、`direct-status`、`direct-body`、`policy-banner`、`lb-mode`、`hash-header-switch`、`hash-ip-switch`、`rewrite-switch`、`rewrite-from`、`rewrite-to`、`timeout-switch`、`timeout-minutes`、`retry-switch`、`retry-count`、`ratelimit-switch`、`ratelimit-rps`、`security-banner`、`jwt-mode`、`auth-mode`、`extra-param-row`、`btn-add-extra-param`、`create-result`、`create-result-json`，以及 `error-<字段>`。

约定：

- `field-name`、`field-path`、`service-weight`、`redirect-url`、`direct-status`、`rewrite-from`、`rewrite-to`、`timeout-minutes`、`retry-count`、`ratelimit-rps` 放在 `<input>` 本身或直接包裹它的元素上。
- `field-group`、`field-domains`、`field-path-type`、`field-methods`、`service-name` 放在包含 `DaoSelect` 的容器（或 `DaoSelect` 根元素）上，`DaoSelect` 的下拉选项文案与上表一致。
- 开关（`auto-weight`、`*-switch`）放在带 `aria-checked` 的可点击元素上。
- 单选组（`route-target`、`lb-mode`、`jwt-mode`、`auth-mode`）放在包含所有选项 `<label>` 的容器上。

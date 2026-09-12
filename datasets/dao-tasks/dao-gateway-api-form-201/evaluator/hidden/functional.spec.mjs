const BASE = "http://app:5173/apis/create";
const tid = (id) => `[data-testid="${id}"]`;
const visible = (page, id) => page.locator(tid(id)).first();
const count = (page, id) => page.locator(tid(id)).count();
const isVisible = (page, id) => page.locator(tid(id)).first().isVisible().catch(() => false);
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// dao-style selects render a <button.dao-selection> trigger and teleport their options to the document root.
// The popper animates into place, so wait until the option's box stops moving before clicking it.
async function settle(locator) {
  let last = JSON.stringify(await locator.boundingBox());
  for (let i = 0; i < 20; i += 1) {
    await wait(60);
    const now = JSON.stringify(await locator.boundingBox());
    if (now === last) return;
    last = now;
  }
}
async function pick(page, scope, ...labels) {
  const root = typeof scope === "string" ? page.locator(scope) : scope;
  const trigger = root.locator(".dao-selection").first();
  for (const label of labels) {
    await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const option = page.locator(".dao-option:visible").filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await option.isVisible().catch(() => false))) await trigger.click();
      try {
        await option.waitFor({ state: "visible", timeout: 3000 });
        await settle(option);
        await option.click({ timeout: 3000 });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await page.keyboard.press("Escape").catch(() => {});
        await wait(150);
      }
    }
    await wait(80);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.click(5, 5);
  await wait(80);
}
const QUICK = { timeout: 4000 };
async function fill(page, id, value) {
  const input = page.locator(`${tid(id)} input, input${tid(id)}`).first();
  await input.fill(String(value), QUICK);
  await input.dispatchEvent("change");
  await input.blur().catch(() => {});
}
async function fillNth(page, id, index, value) {
  const input = page.locator(`${tid(id)} input, input${tid(id)}`).nth(index);
  await input.fill(String(value), QUICK);
  await input.dispatchEvent("change");
  await input.blur().catch(() => {});
}
async function radio(page, groupId, label) {
  await page.locator(`${tid(groupId)} label`).filter({ hasText: label }).first().click(QUICK);
}
async function toggle(page, id, on) {
  const el = visible(page, id);
  const state = (await el.getAttribute("aria-checked", QUICK)) === "true";
  if (state !== on) await el.click(QUICK);
}
async function next(page) { await visible(page, "btn-next").click(QUICK); await wait(150); }
async function prev(page) { await visible(page, "btn-prev").click(QUICK); await wait(150); }
// Bail out of a case as soon as the wizard is not on the panel the scenario needs.
async function expectStep(page, n) { if (!(await onStep(page, n))) throw new Error(`not on step ${n}`); }
const onStep = async (page, n) => (await isVisible(page, `step-panel-${n}`)) && !(await isVisible(page, `step-panel-${n === 1 ? 2 : 1}`));

// A valid step 1 with one backend service route; used by every downstream case.
async function fillStep1(page, { weights = [60, 40] } = {}) {
  await fill(page, "field-name", "order-api");
  await pick(page, tid("field-group"), "payments");
  await pick(page, tid("field-domains"), "api.example.com");
  await pick(page, tid("field-path-type"), "精确匹配");
  await fill(page, "field-path", "/orders");
  await pick(page, tid("field-methods"), "GET", "POST");
  await pick(page, page.locator(tid("service-row")).nth(0).locator(tid("service-name")), "order-svc");
  await fillNth(page, "service-weight", 0, weights[0]);
  if (weights.length > 1) {
    await visible(page, "btn-add-service").click();
    await pick(page, page.locator(tid("service-row")).nth(1).locator(tid("service-name")), "user-svc");
    await fillNth(page, "service-weight", 1, weights[1]);
  }
}

const EXPECTED_PAYLOAD = {
  name: "order-api",
  group: "payments",
  domains: ["api.example.com"],
  match: { pathType: "exact", path: "/orders", methods: ["GET", "POST"] },
  routes: [{
    headers: [], params: [], target: "service", autoWeight: false,
    services: [
      { name: "order-svc", weight: 60, mirror: false },
      { name: "user-svc", weight: 40, mirror: false },
    ],
  }],
  policy: {
    lbMode: "requestHash",
    hash: { byHeader: false, rows: [], byIp: true },
    rewrite: { enabled: true, from: "/blog01", to: "/blog02" },
    timeout: { enabled: true, minutes: 3 },
    retry: { enabled: false },
    requestHeaders: { enabled: false },
    responseHeaders: { enabled: false },
    websocket: false,
    rateLimit: { enabled: true, rps: 20, window: "second", burst: 0, status: 429, headers: [] },
    healthCheck: false,
    cookieRewrite: { enabled: false },
    accessMode: "domain",
  },
  security: { jwtMode: "disabled", authMode: "domain", extraParams: [{ key: "tenant", value: "acme" }] },
};

const deepEqual = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (value) => (Array.isArray(value) ? value.map(sortKeys) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value);

export default [
  { id: "shell-renders", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    const indicator = await visible(page, "step-indicator").textContent();
    return ["基本信息", "策略配置(选填)", "安全配置(选填)"].every((label) => indicator.includes(label)) && await isVisible(page, "btn-next") && await isVisible(page, "btn-cancel") && await count(page, "route-card") === 1;
  } },
  { id: "step1-empty-next-blocked", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await next(page);
    if (!(await onStep(page, 1))) return false;
    const errors = await Promise.all(["error-name", "error-group", "error-domains", "error-path", "error-methods"].map((id) => isVisible(page, id)));
    const nameInvalid = await page.locator(`${tid("field-name")} input, input${tid("field-name")}`).first().getAttribute("aria-invalid", QUICK);
    const described = await page.locator(`${tid("field-name")} input, input${tid("field-name")}`).first().getAttribute("aria-describedby", QUICK);
    return errors.every(Boolean) && await onStep(page, 1) && nameInvalid === "true" && !!described && await page.locator(`#${described.split(" ")[0].replace(/([.:])/g, "\\$1")}`).count() === 1;
  } },
  { id: "step1-name-rules", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    const results = [];
    for (const bad of ["Order-API", "-order", "order-", "order_api", "订单"]) {
      await fill(page, "field-name", bad);
      await next(page);
      if (!(await onStep(page, 1))) return false;
      results.push(await isVisible(page, "error-name"));
    }
    // 64 characters must be rejected either by validation or by capping the input at 63.
    await fill(page, "field-name", "a".repeat(64));
    await next(page);
    const long = await page.locator(`${tid("field-name")} input, input${tid("field-name")}`).first().inputValue();
    results.push(await isVisible(page, "error-name") || long.length <= 63);
    await fill(page, "field-name", "order-api.v1");
    await next(page);
    results.push(!(await isVisible(page, "error-name")));
    return results.every(Boolean) && await onStep(page, 1);
  } },
  { id: "route-weights-sum-100", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page, { weights: [60, 30] });
    await next(page);
    const blocked = await onStep(page, 1);
    if (!blocked) return false;
    const errorText = await page.locator(tid("step-panel-1")).textContent();
    const shows = errorText.includes("权重之和必须为 100");
    await fillNth(page, "service-weight", 1, 40);
    await next(page);
    return blocked && shows && await onStep(page, 2);
  } },
  { id: "auto-weight-bypasses-sum", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page, { weights: [60, 30] });
    await toggle(page, "auto-weight", true);
    const disabled = await page.locator(`${tid("service-weight")} input, input${tid("service-weight")}`).first().isDisabled();
    await next(page);
    return disabled && await onStep(page, 2);
  } },
  { id: "redirect-requires-url", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page, { weights: [100] });
    await radio(page, "route-target", "重定向");
    await next(page);
    const blockedEmpty = await onStep(page, 1) && await page.locator(tid("redirect-url")).count() === 1;
    if (!blockedEmpty) return false;
    await fill(page, "redirect-url", "not a url");
    await next(page);
    const blockedInvalid = await onStep(page, 1);
    if (!blockedInvalid) return false;
    await fill(page, "redirect-url", "https://example.com/new");
    await next(page);
    return blockedEmpty && blockedInvalid && await onStep(page, 2);
  } },
  { id: "prev-keeps-values", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    if (!(await onStep(page, 2))) return false;
    await toggle(page, "rewrite-switch", true);
    await fill(page, "rewrite-from", "/old");
    await prev(page);
    if (!(await onStep(page, 1))) return false;
    const name = await page.locator(`${tid("field-name")} input, input${tid("field-name")}`).first().inputValue(QUICK);
    const path = await page.locator(`${tid("field-path")} input, input${tid("field-path")}`).first().inputValue(QUICK);
    const weights = await page.locator(`${tid("service-weight")} input, input${tid("service-weight")}`).evaluateAll((els) => els.map((el) => el.value));
    const group = await page.locator(tid("field-group")).textContent(QUICK);
    const methods = await page.locator(tid("field-methods")).textContent(QUICK);
    if (name !== "order-api" || path !== "/orders" || weights.join(",") !== "60,40") return false;
    await next(page);
    if (!(await onStep(page, 2))) return false;
    const rewriteOn = (await visible(page, "rewrite-switch").getAttribute("aria-checked", QUICK)) === "true";
    const from = await page.locator(`${tid("rewrite-from")} input, input${tid("rewrite-from")}`).first().inputValue(QUICK).catch(() => "");
    return name === "order-api" && path === "/orders" && weights.join(",") === "60,40" && group.includes("payments") && methods.includes("GET") && methods.includes("POST") && rewriteOn && from === "/old";
  } },
  { id: "step2-hash-needs-one-switch", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await expectStep(page, 2);
    await radio(page, "lb-mode", "请求 Hash");
    const switchesShown = await isVisible(page, "hash-header-switch") && await isVisible(page, "hash-ip-switch");
    await next(page);
    const blocked = await onStep(page, 2) && (await page.locator(tid("step-panel-2")).textContent()).includes("选择使用请求哈希作负载均衡时，以下策略必须启用一个");
    if (!blocked) return false;
    await toggle(page, "hash-ip-switch", true);
    await next(page);
    return switchesShown && blocked && await onStep(page, 3);
  } },
  { id: "step2-timeout-max-5", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await expectStep(page, 2);
    await toggle(page, "timeout-switch", true);
    await fill(page, "timeout-minutes", 500);
    await next(page);
    const blocked = await onStep(page, 2) && (await page.locator(tid("step-panel-2")).textContent()).includes("超时时长配置，最长只支持配置 5 分钟。");
    if (!blocked) return false;
    const invalid = (await page.locator(`${tid("timeout-minutes")} input, input${tid("timeout-minutes")}`).first().getAttribute("aria-invalid")) === "true";
    await fill(page, "timeout-minutes", 5);
    await next(page);
    return blocked && invalid && await onStep(page, 3);
  } },
  { id: "step2-retry-count-min-1", critical: false, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await expectStep(page, 2);
    await toggle(page, "retry-switch", true);
    await fill(page, "retry-count", 0);
    await next(page);
    const blocked = await onStep(page, 2) && await isVisible(page, "error-policy.retryCount");
    if (!blocked) return false;
    await fill(page, "retry-count", 2);
    await next(page);
    return blocked && await onStep(page, 3);
  } },
  { id: "step2-ratelimit-rps-required", critical: false, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await expectStep(page, 2);
    await toggle(page, "ratelimit-switch", true);
    await next(page);
    const blocked = await onStep(page, 2) && await isVisible(page, "error-policy.rateLimitRps");
    if (!blocked) return false;
    await fill(page, "ratelimit-rps", 20);
    await next(page);
    return blocked && await onStep(page, 3);
  } },
  { id: "banners-and-step3-controls", critical: false, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    const banner2 = (await page.locator(tid("step-panel-2")).textContent()).includes("仅针对后端服务有效");
    await next(page);
    const text3 = await page.locator(tid("step-panel-3")).textContent();
    const banner3 = text3.includes("仅针对后端服务有效") && text3.includes("已启用 JWT 认证");
    const controls = await isVisible(page, "jwt-mode") && await isVisible(page, "auth-mode") && await isVisible(page, "btn-add-extra-param") && await isVisible(page, "btn-submit") && await isVisible(page, "btn-prev");
    await visible(page, "btn-add-extra-param").click();
    return banner2 && banner3 && controls && await count(page, "extra-param-row") === 1;
  } },
  { id: "submit-produces-payload", critical: true, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await radio(page, "lb-mode", "请求 Hash");
    await toggle(page, "hash-ip-switch", true);
    await toggle(page, "rewrite-switch", true);
    await fill(page, "rewrite-from", "/blog01");
    await fill(page, "rewrite-to", "/blog02");
    await toggle(page, "timeout-switch", true);
    await fill(page, "timeout-minutes", 3);
    await toggle(page, "ratelimit-switch", true);
    await fill(page, "ratelimit-rps", 20);
    await next(page);
    if (!(await onStep(page, 3))) return false;
    await radio(page, "jwt-mode", "不启用");
    await visible(page, "btn-add-extra-param").click();
    const row = page.locator(tid("extra-param-row")).first();
    await row.locator("input").nth(0).fill("tenant");
    await row.locator("input").nth(1).fill("acme");
    await visible(page, "btn-submit").click();
    await visible(page, "create-result").waitFor();
    const text = await visible(page, "create-result").textContent();
    const start = text.indexOf("{"); const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return false;
    let payload;
    try { payload = JSON.parse(text.slice(start, end + 1)); } catch { return false; }
    return deepEqual(payload, EXPECTED_PAYLOAD) && !(await isVisible(page, "step-panel-3"));
  } },
  { id: "submit-blocked-when-step1-invalid", critical: false, async run(page) {
    await page.goto(BASE);
    await visible(page, "step-panel-1").waitFor();
    await fillStep1(page);
    await next(page);
    await next(page);
    if (!(await onStep(page, 3))) return false;
    await prev(page); await prev(page);
    await fill(page, "field-name", "");
    // Skipping validation on the way back must not let an invalid step 1 reach submit.
    await next(page);
    return await onStep(page, 1) && await isVisible(page, "error-name") && await count(page, "create-result") === 0;
  } },
];

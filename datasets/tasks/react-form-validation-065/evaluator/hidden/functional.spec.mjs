const VALID = { username: "zhang_san1", email: "zhang@example.com", password: "abc12345", confirm: "abc12345" };
const FIELDS = ["username", "email", "password", "confirm"];

async function fillAll(page, values) {
  for (const name of FIELDS) await page.fill(`[data-testid=${name}]`, values[name] ?? "");
}
const errorCount = (page, name) => page.locator(`[data-testid=error-${name}]`).count();
const statusText = async (page) => (await page.locator("[data-testid=form-status]").textContent()) || "";
// Let the fake 100ms submit window elapse so a wrongly-started submission would already have reported success.
const settle = (page) => page.waitForFunction((until) => Date.now() > until, Date.now() + 400);

export default [
  { id: "empty-submit-shows-all-errors", critical: true, async run(page) {
    await page.goto("http://app:5173/");
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid^=error-]").length >= 4);
    for (const name of FIELDS) {
      if (await errorCount(page, name) !== 1) return false;
      if ((await page.locator(`[data-testid=error-${name}]`).textContent() || "").trim() === "") return false;
    }
    await settle(page);
    return !(await statusText(page)).includes("提交成功");
  } },
  { id: "valid-data-submits", critical: true, async run(page) {
    await page.goto("http://app:5173/");
    await fillAll(page, VALID);
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => (document.querySelector("[data-testid=form-status]")?.textContent || "").includes("提交成功"));
    return await page.locator("[data-testid^=error-]").count() === 0 && (await statusText(page)).includes("提交成功");
  } },
  { id: "mismatched-confirm-only-error", critical: true, async run(page) {
    await page.goto("http://app:5173/");
    await fillAll(page, { ...VALID, confirm: "abc12346" });
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=error-confirm]"));
    if (await page.locator("[data-testid^=error-]").count() !== 1) return false;
    if (await errorCount(page, "confirm") !== 1) return false;
    await settle(page);
    if ((await statusText(page)).includes("提交成功")) return false;
    // Fixing the field and resubmitting must clear the error and succeed.
    await page.fill("[data-testid=confirm]", VALID.confirm);
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => (document.querySelector("[data-testid=form-status]")?.textContent || "").includes("提交成功"));
    return await errorCount(page, "confirm") === 0;
  } },
  { id: "invalid-email-rejected", critical: true, async run(page) {
    await page.goto("http://app:5173/");
    await fillAll(page, { ...VALID, email: "not-an-email" });
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=error-email]"));
    await settle(page);
    return await errorCount(page, "email") === 1 && !(await statusText(page)).includes("提交成功");
  } },
  { id: "short-password-marks-aria-invalid", critical: false, async run(page) {
    await page.goto("http://app:5173/");
    await fillAll(page, { ...VALID, password: "abc1", confirm: "abc1" });
    await page.click("[data-testid=submit]");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=error-password]"));
    const ok = await page.waitForFunction(() => {
      const input = document.querySelector("[data-testid=password]");
      const error = document.querySelector("[data-testid=error-password]");
      if (!input || !error || input.getAttribute("aria-invalid") !== "true") return false;
      const described = (input.getAttribute("aria-describedby") || "").split(/\s+/);
      return !!error.id && described.includes(error.id);
    }).then(() => true, () => false);
    return ok && await errorCount(page, "password") === 1;
  } },
  { id: "inputs-have-labels", critical: false, async run(page) {
    await page.goto("http://app:5173/");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=confirm]"));
    return await page.waitForFunction((names) => names.every((name) => {
      const input = document.querySelector(`[data-testid=${name}]`);
      return !!input && !!input.id && !!document.querySelector(`label[for="${input.id}"]`)?.textContent.trim();
    }), FIELDS).then(() => true, () => false);
  } },
];

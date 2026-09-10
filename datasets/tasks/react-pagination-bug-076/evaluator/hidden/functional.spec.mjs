const rows = (page) => page.locator("[data-testid=product-row]");
const rowsText = async (page) => (await rows(page).allTextContents()).join("\n");
const indicator = async (page) => ((await page.locator("[data-testid=page-indicator]").textContent()) || "").replace(/\s+/g, " ").trim();
const waitRows = (page, n) => page.waitForFunction((count) => document.querySelectorAll("[data-testid=product-row]").length === count, n);

export default [
  { id: "next-stops-at-last-page", critical: true, async run(page) {
    await waitRows(page, 5);
    for (let i = 0; i < 4; i += 1) await page.click("[data-testid=next-page]");
    await waitRows(page, 3);
    await page.click("[data-testid=next-page]", { force: true });
    const text = await rowsText(page);
    return await rows(page).count() === 3 && text.includes("P-023") && await indicator(page) === "第 5 / 5 页" && page.url().includes("page=5");
  } },
  { id: "direct-load-page-3", critical: true, async run(page) {
    await page.goto("http://app:5173/?page=3");
    await waitRows(page, 5);
    const text = await rowsText(page);
    return text.includes("P-011") && text.includes("P-015") && !text.includes("P-010") && !text.includes("P-016") && await indicator(page) === "第 3 / 5 页";
  } },
  { id: "indicator-total-pages", critical: true, async run(page) {
    await waitRows(page, 5);
    return await indicator(page) === "第 1 / 5 页";
  } },
  { id: "prev-stays-on-first-page", critical: false, async run(page) {
    await waitRows(page, 5);
    await page.click("[data-testid=prev-page]", { force: true });
    const text = await rowsText(page);
    return await rows(page).count() === 5 && text.includes("P-001") && await indicator(page) === "第 1 / 5 页" && !/page=0/.test(page.url());
  } },
  { id: "pager-buttons-named-and-disabled", critical: false, async run(page) {
    await waitRows(page, 5);
    const named = (selector) => page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const own = Array.from(el.childNodes).filter((n) => !(n.nodeType === 1 && n.getAttribute("aria-hidden") === "true")).map((n) => n.textContent).join("").trim();
      return Boolean((el.getAttribute("aria-label") || "").trim() || own);
    }, selector);
    await named("[data-testid=prev-page]");
    await named("[data-testid=next-page]");
    await page.waitForFunction(() => document.querySelector("[data-testid=prev-page]").hasAttribute("disabled") && !document.querySelector("[data-testid=next-page]").hasAttribute("disabled"));
    await page.goto("http://app:5173/?page=5");
    await waitRows(page, 3);
    await page.waitForFunction(() => document.querySelector("[data-testid=next-page]").hasAttribute("disabled") && !document.querySelector("[data-testid=prev-page]").hasAttribute("disabled"));
    return true;
  } },
];

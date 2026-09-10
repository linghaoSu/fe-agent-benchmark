const rows = (page) => page.locator("[data-testid=order-row]");
const rowsText = async (page) => (await rows(page).allTextContents()).join("\n");

export default [
  { id: "customer-search", critical: true, async run(page) {
    await page.fill("[data-testid=search-input]", "王小明");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=order-row]").length === 2);
    return await rows(page).count() === 2 && (await rowsText(page)).includes("王小明");
  } },
  { id: "status-filter", critical: true, async run(page) {
    await page.selectOption("[data-testid=status-filter]", "shipped");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=order-row]").length === 3);
    return !(await rowsText(page)).includes("待处理") && !(await rowsText(page)).includes("已送达");
  } },
  { id: "url-state-and-direct-load", critical: true, async run(page) {
    await page.fill("[data-testid=search-input]", "李娜");
    await page.selectOption("[data-testid=status-filter]", "shipped");
    if (!page.url().includes("?q=%E6%9D%8E%E5%A8%9C&status=shipped")) return false;
    await page.goto("http://app:5173/?status=delivered");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=order-row]").length === 2);
    return await page.locator("[data-testid=status-filter]").textContent() !== null && !(await rowsText(page)).includes("待处理");
  } },
  { id: "empty-state", critical: false, async run(page) {
    await page.fill("[data-testid=search-input]", "不存在的客户");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=empty-state]"));
    return await page.locator("[data-testid=empty-state]").count() === 1;
  } },
  { id: "clear-search", critical: false, async run(page) {
    await page.fill("[data-testid=search-input]", "王小明");
    await page.fill("[data-testid=search-input]", "");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=order-row]").length === 8);
    return await rows(page).count() === 8;
  } },
];

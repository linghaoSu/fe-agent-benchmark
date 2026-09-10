const rows = (page) => page.locator("[data-testid=todo-row]");
const toggles = (page) => page.locator("[data-testid=todo-toggle]");
const rowsText = async (page) => (await rows(page).allTextContents()).join("\n");
const remaining = (page) => page.locator("[data-testid=remaining-count]").textContent();
const waitRows = (page, n) => page.waitForFunction((count) => document.querySelectorAll("[data-testid=todo-row]").length === count, n);
const waitRemaining = (page, n) => page.waitForFunction((count) => (document.querySelector("[data-testid=remaining-count]")?.textContent || "").replace(/\s+/g, "") === `剩余${count}项`, n);
const waitRowCompleted = (page, index, value) => page.waitForFunction(([i, v]) => document.querySelectorAll("[data-testid=todo-row]")[i]?.getAttribute("data-completed") === v, [index, value]);

export default [
  { id: "toggle-by-id-under-active-filter", critical: true, async run(page) {
    await waitRows(page, 6);
    await page.selectOption("[data-testid=todo-filter]", "active");
    await waitRows(page, 4);
    // 2nd visible active row is t3 "编写单元测试" (full-array index 2, not 1).
    await toggles(page).nth(1).click();
    await waitRows(page, 3);
    const text = await rowsText(page);
    if (text.includes("编写单元测试") || !text.includes("整理需求文档") || !text.includes("修复登录页样式")) return false;
    await waitRemaining(page, 3);
    await page.selectOption("[data-testid=todo-filter]", "all");
    await waitRows(page, 6);
    await waitRowCompleted(page, 2, "true");
    await waitRowCompleted(page, 1, "true");
    await waitRowCompleted(page, 0, "false");
    return page.waitForFunction(() => document.querySelectorAll("[data-testid=todo-toggle]")[2]?.checked === true).then(() => true);
  } },
  { id: "remaining-count-after-toggles", critical: true, async run(page) {
    await waitRows(page, 6);
    await waitRemaining(page, 4);
    await toggles(page).nth(0).click();
    await waitRemaining(page, 3);
    await toggles(page).nth(2).click();
    await waitRemaining(page, 2);
    return (await remaining(page)).replace(/\s+/g, "") === "剩余2项";
  } },
  { id: "completed-filter-reflects-toggles", critical: true, async run(page) {
    await waitRows(page, 6);
    await page.selectOption("[data-testid=todo-filter]", "completed");
    await waitRows(page, 2);
    const before = await rowsText(page);
    if (!before.includes("评审设计稿") || !before.includes("更新依赖版本") || before.includes("整理需求文档")) return false;
    await page.selectOption("[data-testid=todo-filter]", "all");
    await waitRows(page, 6);
    await toggles(page).nth(0).click();
    await waitRowCompleted(page, 0, "true");
    await page.selectOption("[data-testid=todo-filter]", "completed");
    await waitRows(page, 3);
    if (!(await rowsText(page)).includes("整理需求文档")) return false;
    await page.waitForFunction(() => {
      const list = [...document.querySelectorAll("[data-testid=todo-row]")];
      const boxes = [...document.querySelectorAll("[data-testid=todo-toggle]")];
      return list.length === 3 && list.every((row) => row.getAttribute("data-completed") === "true") && boxes.length === 3 && boxes.every((box) => box.checked);
    });
    return true;
  } },
  { id: "toggle-twice-restores", critical: false, async run(page) {
    await waitRows(page, 6);
    await toggles(page).nth(0).click();
    await waitRowCompleted(page, 0, "true");
    await waitRemaining(page, 3);
    await toggles(page).nth(0).click();
    await waitRowCompleted(page, 0, "false");
    await waitRemaining(page, 4);
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=todo-toggle]")[0]?.checked === false);
    return true;
  } },
  { id: "filter-has-accessible-name", critical: false, async run(page) {
    await waitRows(page, 6);
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-testid=todo-filter]");
      if (!el) return false;
      if ((el.getAttribute("aria-label") || "").trim()) return true;
      const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      if (ids.some((id) => (document.getElementById(id)?.textContent || "").trim())) return true;
      if (el.id && [...document.querySelectorAll("label[for]")].some((l) => l.getAttribute("for") === el.id && l.textContent.trim())) return true;
      return !!(el.closest("label") && el.closest("label").textContent.trim());
    });
    return true;
  } },
];

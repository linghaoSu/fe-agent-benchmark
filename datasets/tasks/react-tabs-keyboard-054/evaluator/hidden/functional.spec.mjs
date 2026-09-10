// Tab strip data (mirrors src/data/tabs.js; the Agent must not change the data file).
const PANELS = [
  "通用设置：语言、时区与主题偏好。",
  "通知设置：邮件、短信与站内消息提醒。",
  "隐私设置：数据共享、活动记录与可见范围。",
  "账户设置：登录方式、密码与安全验证。",
];
const tabsLocator = (page) => page.locator("[data-testid=tab]");
const panelText = async (page) => ((await page.locator("[data-testid=tab-panel]").textContent()) || "").trim();
// In-page predicate: tab `index` is selected (aria-selected) and, when `focused`, owns document.activeElement.
const selectedAndFocused = ({ index, focused }) => {
  const tabs = document.querySelectorAll("[data-testid=tab]");
  const tab = tabs[index];
  if (!tab || tab.getAttribute("aria-selected") !== "true") return false;
  if ([...tabs].filter((t) => t.getAttribute("aria-selected") === "true").length !== 1) return false;
  return !focused || document.activeElement === tab;
};
const focusFirstTab = async (page) => {
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=tab]").length === 4);
  await tabsLocator(page).first().focus();
  await page.waitForFunction(() => document.activeElement === document.querySelector("[data-testid=tab]"));
};

export default [
  { id: "click-selects-and-updates-panel", critical: true, async run(page) {
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=tab]").length === 4);
    await tabsLocator(page).nth(2).click();
    await page.waitForFunction(selectedAndFocused, { index: 2, focused: false });
    await page.waitForFunction((expected) => (document.querySelector("[data-testid=tab-panel]")?.textContent || "").trim() === expected, PANELS[2]);
    return await panelText(page) === PANELS[2] && await page.locator("[data-testid=tab-panel]").count() === 1;
  } },
  { id: "arrow-right-moves-focus-and-selection", critical: true, async run(page) {
    await focusFirstTab(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(selectedAndFocused, { index: 1, focused: true });
    await page.waitForFunction((expected) => (document.querySelector("[data-testid=tab-panel]")?.textContent || "").trim() === expected, PANELS[1]);
    return await panelText(page) === PANELS[1];
  } },
  { id: "arrow-left-wraps-to-last", critical: true, async run(page) {
    await focusFirstTab(page);
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(selectedAndFocused, { index: 3, focused: true });
    return await panelText(page) === PANELS[3];
  } },
  { id: "end-jumps-to-last", critical: false, async run(page) {
    await focusFirstTab(page);
    await page.keyboard.press("End");
    await page.waitForFunction(selectedAndFocused, { index: 3, focused: true });
    return await panelText(page) === PANELS[3];
  } },
  { id: "tab-roles-and-single-selection", critical: false, async run(page) {
    await page.waitForFunction(() => {
      const strip = document.querySelector("[data-testid=tab-strip]");
      const tabs = [...document.querySelectorAll("[data-testid=tab]")];
      const panel = document.querySelector("[data-testid=tab-panel]");
      const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
      return !!strip && strip.getAttribute("role") === "tablist" && !!(strip.getAttribute("aria-label") || "").trim()
        && tabs.length === 4 && tabs.every((t) => t.getAttribute("role") === "tab" && !!t.id && !!t.getAttribute("aria-controls"))
        && selected.length === 1
        && tabs.filter((t) => t.getAttribute("tabindex") === "0").length === 1
        && !!panel && panel.getAttribute("role") === "tabpanel" && !!panel.id
        && selected[0].getAttribute("aria-controls") === panel.id && panel.getAttribute("aria-labelledby") === selected[0].id;
    });
    return await tabsLocator(page).count() === 4;
  } },
];

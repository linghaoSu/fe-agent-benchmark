// Visibility helpers run inside the page: an element is "shown" when it is attached, not hidden via
// display:none / hidden attribute (checkVisibility) and has a non-empty box.
const shownCount = (selector) => `Array.from(document.querySelectorAll("${selector}")).filter((el) => el.checkVisibility() && el.getBoundingClientRect().width > 0).length`;
const settle = async (page, expression) => { try { await page.waitForFunction(expression); return true; } catch { return false; } };
const open = async (page, width, height) => { await page.setViewportSize({ width, height }); await page.goto("http://app:5173/"); await page.waitForFunction(() => document.querySelectorAll("[data-testid=nav-link]").length === 7); };

export default [
  { id: "mobile-nav-collapsed-by-default", critical: true, async run(page) {
    await open(page, 375, 812);
    return settle(page, `${shownCount("[data-testid=nav-toggle]")} === 1 && ${shownCount("[data-testid=nav-list]")} === 0 && ${shownCount("[data-testid=nav-link]")} === 0`);
  } },
  { id: "mobile-toggle-reveals-all-links", critical: true, async run(page) {
    await open(page, 375, 812);
    if (!(await settle(page, `${shownCount("[data-testid=nav-toggle]")} === 1`))) return false;
    await page.click("[data-testid=nav-toggle]");
    if (!(await settle(page, `${shownCount("[data-testid=nav-list]")} === 1 && ${shownCount("[data-testid=nav-link]")} === 7`))) return false;
    const labels = await page.locator("[data-testid=nav-link]").allTextContents();
    return labels.length === 7 && new Set(labels.map((label) => label.trim())).size === 7;
  } },
  { id: "desktop-shows-links-without-toggle", critical: true, async run(page) {
    await open(page, 1440, 900);
    return settle(page, `${shownCount("[data-testid=nav-toggle]")} === 0 && ${shownCount("[data-testid=nav-list]")} === 1 && ${shownCount("[data-testid=nav-link]")} === 7`);
  } },
  { id: "mobile-no-horizontal-overflow", critical: false, async run(page) {
    await open(page, 375, 812);
    return settle(page, () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
  } },
  { id: "toggle-reports-aria-expanded", critical: false, async run(page) {
    await open(page, 375, 812);
    if (!(await settle(page, `${shownCount("[data-testid=nav-toggle]")} === 1 && document.querySelector("[data-testid=nav-toggle]").getAttribute("aria-expanded") === "false"`))) return false;
    const controls = await page.locator("[data-testid=nav-toggle]").count() === 1 && await settle(page, () => { const id = document.querySelector("[data-testid=nav-toggle]").getAttribute("aria-controls"); return !!id && document.getElementById(id)?.dataset.testid === "nav-list"; });
    if (!controls) return false;
    await page.click("[data-testid=nav-toggle]");
    if (!(await settle(page, `document.querySelector("[data-testid=nav-toggle]").getAttribute("aria-expanded") === "true" && ${shownCount("[data-testid=nav-link]")} === 7`))) return false;
    await page.click("[data-testid=nav-toggle]");
    return settle(page, `document.querySelector("[data-testid=nav-toggle]").getAttribute("aria-expanded") === "false" && ${shownCount("[data-testid=nav-link]")} === 0`);
  } },
  { id: "toggle-has-accessible-name", critical: false, async run(page) {
    await open(page, 375, 812);
    return settle(page, () => { const button = document.querySelector("[data-testid=nav-toggle]"); if (!button) return false; const name = button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || (button.getAttribute("aria-labelledby") && document.getElementById(button.getAttribute("aria-labelledby"))?.textContent) || ""; return name.trim().length > 0; });
  } },
];

const rows = (page) => page.locator("[data-testid=user-row]");
const rowsText = async (page) => (await rows(page).allTextContents()).join("\n").toLowerCase();
const settle = (page, ms) => page.waitForFunction(([start, wait]) => Date.now() - start > wait, [Date.now(), ms]);

export default [
  { id: "debounce-limits-requests", critical: true, async run(page) {
    // Five fast keystrokes within the 150 ms window must coalesce into at most two API calls.
    await page.evaluate(() => { globalThis.__searchUsersCalls = 0; });
    const input = page.locator("[data-testid=search-input]");
    await input.fill("");
    for (const chunk of ["a", "an", "ann", "anna", "annab"]) { await input.fill(chunk); await page.waitForTimeout(20); }
    await page.waitForFunction(() => !document.querySelector("[data-testid=loading-state]"), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const calls = await page.evaluate(() => globalThis.__searchUsersCalls || 0);
    return calls >= 1 && calls <= 2;
  } },
  { id: "stale-response-ignored", critical: true, async run(page) {
    // "an" resolves slowly (700ms), "ann" quickly (100ms). Wait until the "an" request is in flight, then type "ann".
    await page.fill("[data-testid=search-input]", "an");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=loading-state]"));
    await page.fill("[data-testid=search-input]", "ann");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=user-row]").length === 2);
    await settle(page, 900);
    const text = await rowsText(page);
    return await rows(page).count() === 2 && text.includes("anna") && text.includes("hannah") && !text.includes("andy")
      && (await page.locator("[data-testid=result-count]").textContent()).includes("2");
  } },
  { id: "clear-input-restores-all", critical: true, async run(page) {
    await page.fill("[data-testid=search-input]", "ann");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=user-row]").length === 2);
    await page.fill("[data-testid=search-input]", "");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=user-row]").length === 12);
    await settle(page, 300);
    return await rows(page).count() === 12 && await page.locator("[data-testid=empty-state]").count() === 0
      && (await page.locator("[data-testid=result-count]").textContent()).includes("12");
  } },
  { id: "search-narrows-by-name-or-email", critical: true, async run(page) {
    await page.fill("[data-testid=search-input]", "an");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=user-row]").length === 7);
    const text = await rowsText(page);
    if (!(text.includes("anna") && text.includes("andy") && text.includes("susan") && text.includes("diane"))) return false;
    await page.fill("[data-testid=search-input]", "example.com");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=user-row]").length === 12);
    return (await page.locator("[data-testid=result-count]").textContent()).includes("12");
  } },
  { id: "empty-state-after-no-match", critical: false, async run(page) {
    await page.fill("[data-testid=search-input]", "zzqxv");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=empty-state]"));
    return await page.locator("[data-testid=empty-state]").count() === 1 && await rows(page).count() === 0
      && (await page.locator("[data-testid=result-count]").textContent()).includes("0");
  } },
  { id: "loading-state-while-pending", critical: false, async run(page) {
    await page.fill("[data-testid=search-input]", "an");
    await page.waitForFunction(() => !!document.querySelector("[data-testid=loading-state]"));
    await page.waitForFunction(() => !document.querySelector("[data-testid=loading-state]"));
    return await rows(page).count() === 7;
  } },
  { id: "search-input-accessible-name", critical: false, async run(page) {
    return await page.locator("[data-testid=search-input]").count() === 1 && await page.waitForFunction(() => {
      const input = document.querySelector("[data-testid=search-input]");
      if (!input) return false;
      if ((input.getAttribute("aria-label") || "").trim()) return true;
      const ids = (input.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
      if (ids.some((id) => (document.getElementById(id)?.textContent || "").trim())) return true;
      return [...(input.labels || [])].some((label) => label.textContent.trim().length > 0);
    }).then(() => true);
  } },
];

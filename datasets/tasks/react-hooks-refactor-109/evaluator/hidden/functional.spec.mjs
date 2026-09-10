const text = async (page, id) => ((await page.locator(`[data-testid=${id}]`).textContent()) || "").trim();
const items = (page) => page.locator("[data-testid=note-item]");
const addNote = async (page, note) => { await page.fill("[data-testid=note-input]", note); await page.click("[data-testid=add-note]"); };

export default [
  // The refactor is the requirement: the singleton store must be gone and the hook must exist and be what app.js uses.
  { id: "store-replaced-by-hook", critical: true, async run(page) {
    const status = async (path) => page.evaluate(async (p) => (await fetch(p, { cache: "no-store" })).status, path);
    if (await status("/src/store.js") !== 404) return false;
    if (await status("/src/hooks/useDashboard.js") !== 200) return false;
    const app = await page.evaluate(async () => (await fetch("/src/app.js", { cache: "no-store" })).text());
    const hook = await page.evaluate(async () => (await fetch("/src/hooks/useDashboard.js", { cache: "no-store" })).text());
    return /useDashboard/.test(app) && !/store\.js/.test(app) && /useReducer/.test(hook);
  } },
  { id: "increment-then-reset", critical: true, async run(page) {
    for (let i = 0; i < 3; i += 1) await page.click("[data-testid=increment]");
    await page.waitForFunction(() => document.querySelector("[data-testid=count]")?.textContent.trim() === "3");
    await page.click("[data-testid=reset]");
    await page.waitForFunction(() => document.querySelector("[data-testid=count]")?.textContent.trim() === "0");
    return await text(page, "count") === "0";
  } },
  { id: "add-two-notes", critical: true, async run(page) {
    await addNote(page, "买牛奶");
    await addNote(page, "写周报");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=note-item]").length === 2);
    const all = (await items(page).allTextContents()).join("\n");
    return all.includes("买牛奶") && all.includes("写周报") && await text(page, "note-count") === "2";
  } },
  { id: "note-input-clears", critical: true, async run(page) {
    await addNote(page, "临时笔记");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=note-item]").length === 1);
    await page.waitForFunction(() => document.querySelector("[data-testid=note-input]")?.value === "");
    return await items(page).count() === 1;
  } },
  { id: "empty-note-ignored", critical: false, async run(page) {
    await addNote(page, "第一条");
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=note-item]").length === 1);
    await addNote(page, "");
    await addNote(page, "   ");
    await addNote(page, "第二条");
    await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-testid=note-item]")).some((item) => item.textContent.includes("第二条")));
    return await items(page).count() === 2 && await text(page, "note-count") === "2";
  } },
  { id: "controls-have-names", critical: false, async run(page) {
    await page.waitForFunction(() => !!document.querySelector("[data-testid=add-note]"));
    for (const id of ["increment", "reset", "add-note"]) {
      if ((await text(page, id)) === "" && await page.locator(`[data-testid=${id}][aria-label]`).count() === 0) return false;
    }
    return await page.locator("[data-testid=note-input][aria-label], [data-testid=note-input][aria-labelledby], [data-testid=note-input][id]").count() === 1;
  } },
];

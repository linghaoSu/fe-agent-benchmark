const total = (page) => page.locator("[data-testid=cart-total]").textContent();
const count = (page) => page.locator("[data-testid=item-count]").textContent();
const rows = (page) => page.locator("[data-testid=cart-row]");
const row = (page, index) => rows(page).nth(index);
const qty = (page, index) => row(page, index).locator("[data-testid=qty-value]").textContent();
const waitTotal = (page, text) => page.waitForFunction((expected) => document.querySelector("[data-testid=cart-total]")?.textContent.trim() === expected, text);

// Data: 1014×1, 2990×2, 100×98, 79900×1 → 96694 分 = ¥966.94, 102 件
export default [
  { id: "increment-updates-total", critical: true, async run(page) {
    await waitTotal(page, "¥966.94");
    await row(page, 1).locator("[data-testid=qty-increment]").click();
    await waitTotal(page, "¥996.84");
    return (await qty(page, 1)).trim() === "3" && (await count(page)).trim() === "103" && (await total(page)).trim() === "¥996.84";
  } },
  { id: "remove-updates-count-and-total", critical: true, async run(page) {
    await waitTotal(page, "¥966.94");
    await row(page, 0).locator("[data-testid=remove-item]").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=cart-row]").length === 3);
    await waitTotal(page, "¥956.80");
    return await rows(page).count() === 3 && (await count(page)).trim() === "101" && (await total(page)).trim() === "¥956.80";
  } },
  { id: "decrement-floors-at-one", critical: true, async run(page) {
    await waitTotal(page, "¥966.94");
    await row(page, 1).locator("[data-testid=qty-decrement]").click();
    await waitTotal(page, "¥937.04");
    if ((await qty(page, 1)).trim() !== "1") return false;
    await row(page, 0).locator("[data-testid=qty-decrement]").click();
    await row(page, 0).locator("[data-testid=qty-decrement]").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=cart-row]").length === 4);
    return (await qty(page, 0)).trim() === "1" && (await total(page)).trim() === "¥937.04" && (await count(page)).trim() === "101";
  } },
  { id: "increment-caps-at-99", critical: false, async run(page) {
    await waitTotal(page, "¥966.94");
    await row(page, 2).locator("[data-testid=qty-increment]").click();
    await waitTotal(page, "¥967.94");
    await row(page, 2).locator("[data-testid=qty-increment]").click();
    await row(page, 2).locator("[data-testid=qty-increment]").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=cart-row]").length === 4);
    return (await qty(page, 2)).trim() === "99" && (await total(page)).trim() === "¥967.94" && (await count(page)).trim() === "103";
  } },
  { id: "total-uses-thousands-separator", critical: false, async run(page) {
    await waitTotal(page, "¥966.94");
    await row(page, 3).locator("[data-testid=qty-increment]").click();
    await waitTotal(page, "¥1,765.94");
    return (await total(page)).trim() === "¥1,765.94" && (await count(page)).trim() === "103";
  } },
  { id: "empty-cart-message", critical: false, async run(page) {
    await waitTotal(page, "¥966.94");
    for (let i = 0; i < 4; i += 1) {
      await row(page, 0).locator("[data-testid=remove-item]").click();
      await page.waitForFunction((expected) => document.querySelectorAll("[data-testid=cart-row]").length === expected, 3 - i);
    }
    await page.waitForFunction(() => !!document.querySelector("[data-testid=empty-cart]"));
    return await page.locator("[data-testid=empty-cart]").count() === 1 && (await count(page)).trim() === "0" && (await total(page)).trim() === "¥0.00";
  } },
];

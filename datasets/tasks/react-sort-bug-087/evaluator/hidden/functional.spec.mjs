const ROWS = "[data-testid=employee-row]";
const cells = (page, id) => page.locator(`[data-testid=${id}]`).allTextContents();
const salaries = async (page) => (await cells(page, "employee-salary")).map((value) => Number(value.replace(/[^\d.]/g, "")));
const waitForRows = (page) => page.waitForFunction((selector) => document.querySelectorAll(selector).length === 10, ROWS);
const clickAndSettle = async (page, testid, expectedFirst) => {
  await page.click(`[data-testid=${testid}]`);
  await page.waitForFunction(({ selector, first }) => {
    const rows = document.querySelectorAll(selector);
    return rows.length === 10 && rows[0].textContent.includes(first);
  }, { selector: ROWS, first: expectedFirst });
};
const isSortedAsc = (list) => list.every((value, index) => index === 0 || list[index - 1] <= value);
const isSortedDesc = (list) => list.every((value, index) => index === 0 || list[index - 1] >= value);
const sortedHeader = (page, testid, direction) => page.locator(`[aria-sort=${direction}] [data-testid=${testid}], [data-testid=${testid}][aria-sort=${direction}]`).count();

const DEPARTMENT_ASC = "Ivan Wu|David Yang|Ethan Zhao|Adam Wang|Hannah Sun|Grace Li|Ben Liu|Fiona Chen|Chloe Zhou|Julia Xu";
const DEPARTMENT_DESC = "Fiona Chen|Chloe Zhou|Julia Xu|Grace Li|Ben Liu|Ethan Zhao|Adam Wang|Hannah Sun|Ivan Wu|David Yang";

export default [
  { id: "salary-numeric-ascending", critical: true, async run(page) {
    await waitForRows(page);
    await clickAndSettle(page, "sort-salary", "Adam Wang");
    const values = await salaries(page);
    return values.length === 10 && values[0] === 900 && values[1] === 900 && values[9] === 20000 && values.indexOf(12000) > values.indexOf(8500) && isSortedAsc(values);
  } },
  { id: "department-descending-stable", critical: true, async run(page) {
    await waitForRows(page);
    await clickAndSettle(page, "sort-department", "Ivan Wu");
    if ((await cells(page, "employee-name")).join("|") !== DEPARTMENT_ASC) return false;
    await clickAndSettle(page, "sort-department", "Fiona Chen");
    return (await cells(page, "employee-name")).join("|") === DEPARTMENT_DESC;
  } },
  { id: "source-not-mutated", critical: true, async run(page) {
    await waitForRows(page);
    await clickAndSettle(page, "sort-name", "Adam Wang");
    await clickAndSettle(page, "sort-salary", "Adam Wang");
    await clickAndSettle(page, "sort-salary", "David Yang");
    if (!isSortedDesc(await salaries(page))) return false;
    await clickAndSettle(page, "sort-name", "Adam Wang");
    const names = await cells(page, "employee-name");
    if (names.length !== 10 || !isSortedAsc(names) || names[9] !== "Julia Xu") return false;
    await clickAndSettle(page, "sort-department", "Ivan Wu");
    return (await cells(page, "employee-name")).join("|") === DEPARTMENT_ASC;
  } },
  { id: "aria-sort-reflects-active-column", critical: false, async run(page) {
    await waitForRows(page);
    await clickAndSettle(page, "sort-salary", "Adam Wang");
    await page.waitForFunction(() => document.querySelectorAll("[aria-sort=ascending]").length === 1);
    if (await sortedHeader(page, "sort-salary", "ascending") !== 1) return false;
    await clickAndSettle(page, "sort-salary", "David Yang");
    await page.waitForFunction(() => document.querySelectorAll("[aria-sort=descending]").length === 1);
    if (await sortedHeader(page, "sort-salary", "descending") !== 1) return false;
    const marked = await page.locator("[aria-sort=ascending], [aria-sort=descending], [aria-sort=other]").count();
    return marked === 1 && await page.locator("[data-testid=sort-indicator]").count() === 1;
  } },
  { id: "headers-are-named-buttons", critical: false, async run(page) {
    await waitForRows(page);
    for (const id of ["sort-name", "sort-department", "sort-salary"]) {
      const button = page.locator(`button[data-testid=${id}], [role=button][data-testid=${id}]`);
      if (await button.count() !== 1) return false;
      const labelled = await page.locator(`[data-testid=${id}][aria-label]:not([aria-label=""])`).count();
      if (!labelled && !((await button.textContent()) || "").trim()) return false;
    }
    return true;
  } },
];

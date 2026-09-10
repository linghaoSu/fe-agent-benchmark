export default [
  { id: "title-renders", critical: true, run: async (page) => (await page.getByTestId("title").textContent()) === "node-min" },
  { id: "health-endpoint", critical: false, run: async (page) => page.evaluate(async () => (await (await fetch("/api/health")).json()).ok === true) },
];

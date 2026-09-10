import assert from "node:assert/strict";
import test from "node:test";
import { clampPage, pageItems, parsePage, totalPages } from "../src/pagination.js";

test("totalPages rounds up and never drops below 1", () => {
  assert.equal(totalPages(23, 5), 5);
  assert.equal(totalPages(25, 5), 5);
  assert.equal(totalPages(0, 5), 1);
});

test("clampPage keeps the page inside 1..total", () => {
  assert.equal(clampPage(6, 5), 5);
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage("abc", 5), 1);
  assert.equal(clampPage(3, 5), 3);
});

test("parsePage reads ?page= and pageItems slices the right window", () => {
  assert.equal(parsePage("?page=3", 5), 3);
  assert.equal(parsePage("", 5), 1);
  const items = Array.from({ length: 23 }, (_, i) => i + 1);
  assert.deepEqual(pageItems(items, 3, 5), [11, 12, 13, 14, 15]);
  assert.deepEqual(pageItems(items, 5, 5), [21, 22, 23]);
});

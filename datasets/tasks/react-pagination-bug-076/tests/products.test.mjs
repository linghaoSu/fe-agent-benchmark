import assert from "node:assert/strict";
import test from "node:test";
import { products, PAGE_SIZE } from "../src/data/products.js";

test("mock products: 23 unique items, page size 5", () => {
  assert.equal(products.length, 23);
  assert.equal(PAGE_SIZE, 5);
  assert.equal(new Set(products.map((product) => product.id)).size, 23);
});

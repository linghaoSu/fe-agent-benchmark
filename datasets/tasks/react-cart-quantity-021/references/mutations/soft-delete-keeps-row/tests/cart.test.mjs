import assert from "node:assert/strict";
import test from "node:test";
import { changeQuantity, formatCents, itemCount, removeItem, totalCents } from "../src/cart.js";

const items = [
  { id: "A", name: "a", unitPrice: 1014, quantity: 1 },
  { id: "B", name: "b", unitPrice: 2990, quantity: 3 },
  { id: "C", name: "c", unitPrice: 100, quantity: 98 },
  { id: "D", name: "d", unitPrice: 79900, quantity: 1 },
];

test("totalCents sums integer cents exactly", () => {
  assert.equal(totalCents(items), 99684);
  assert.equal(itemCount(items), 103);
});

test("formatCents renders yuan with two decimals and thousands separators", () => {
  assert.equal(formatCents(99684), "¥996.84");
  assert.equal(formatCents(176594), "¥1,765.94");
  assert.equal(formatCents(0), "¥0.00");
  assert.equal(formatCents(123456789), "¥1,234,567.89");
});

test("changeQuantity clamps to 1..99 and removeItem drops the row", () => {
  assert.equal(changeQuantity(items, "A", -1)[0].quantity, 1);
  assert.equal(changeQuantity(items, "C", 1)[2].quantity, 99);
  assert.equal(changeQuantity(items, "C", 2)[2].quantity, 99);
  assert.equal(changeQuantity(items, "B", -1)[1].quantity, 2);
  assert.deepEqual(removeItem(items, "A").map((i) => i.id), ["B", "C", "D"]);
});

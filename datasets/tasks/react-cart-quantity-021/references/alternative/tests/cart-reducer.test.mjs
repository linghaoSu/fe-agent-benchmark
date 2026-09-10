import assert from "node:assert/strict";
import test from "node:test";
import { cartReducer, selectItems, selectSummary, toState } from "../src/store/cartReducer.js";
import { formatYuan } from "../src/money.js";

const initial = toState([
  { id: "A", name: "a", unitPrice: 1014, quantity: 1 },
  { id: "B", name: "b", unitPrice: 2990, quantity: 2 },
  { id: "C", name: "c", unitPrice: 100, quantity: 98 },
  { id: "D", name: "d", unitPrice: 79900, quantity: 1 },
]);

test("reducer clamps quantities and ignores out-of-range moves", () => {
  assert.equal(cartReducer(initial, { type: "decrement", id: "A" }), initial);
  const capped = cartReducer(cartReducer(initial, { type: "increment", id: "C" }), { type: "increment", id: "C" });
  assert.equal(capped.byId.C.quantity, 99);
  assert.equal(cartReducer(initial, { type: "increment", id: "B" }).byId.B.quantity, 3);
});

test("remove drops the row and summary stays in integer cents", () => {
  const next = cartReducer(initial, { type: "remove", id: "A" });
  assert.deepEqual(selectItems(next).map((i) => i.id), ["B", "C", "D"]);
  assert.deepEqual(selectSummary(next), { cents: 95680, count: 101 });
  assert.deepEqual(selectSummary(cartReducer(initial, { type: "increment", id: "B" })), { cents: 99684, count: 103 });
});

test("formatYuan uses ¥, two decimals and thousands separators", () => {
  assert.equal(formatYuan(99684), "¥996.84");
  assert.equal(formatYuan(176594), "¥1,765.94");
  assert.equal(formatYuan(0), "¥0.00");
});

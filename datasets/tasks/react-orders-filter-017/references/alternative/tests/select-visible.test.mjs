import assert from "node:assert/strict";
import test from "node:test";
import { selectVisible } from "../src/selectors.js";

const orders = [
  { id: "A1", customer: "王小明", status: "pending" },
  { id: "B2", customer: "李娜", status: "shipped" },
  { id: "C3", customer: "王小明", status: "delivered" },
];

test("selectVisible matches id or customer and narrows by status", () => {
  assert.deepEqual(selectVisible(orders, { q: "王小明", status: "" }).map((o) => o.id), ["A1", "C3"]);
  assert.deepEqual(selectVisible(orders, { q: "b2", status: "" }).map((o) => o.id), ["B2"]);
  assert.deepEqual(selectVisible(orders, { q: "", status: "shipped" }).map((o) => o.id), ["B2"]);
});

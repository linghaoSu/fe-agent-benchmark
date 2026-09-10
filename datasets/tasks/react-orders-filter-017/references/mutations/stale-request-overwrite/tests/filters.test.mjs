import assert from "node:assert/strict";
import test from "node:test";
import { filterOrders, parseFilters } from "../src/filters.js";

const orders = [
  { id: "A1", customer: "王小明", status: "pending" },
  { id: "B2", customer: "李娜", status: "shipped" },
  { id: "C3", customer: "王小明", status: "delivered" },
];

test("parseFilters reads q and a known status from the query string", () => {
  assert.deepEqual(parseFilters("?q=%E6%9D%8E%E5%A8%9C&status=shipped"), { q: "李娜", status: "shipped" });
  assert.deepEqual(parseFilters("?status=bogus"), { q: "", status: "" });
});

test("filterOrders matches id or customer and narrows by status", () => {
  assert.deepEqual(filterOrders(orders, { q: "王小明", status: "" }).map((o) => o.id), ["A1", "C3"]);
  assert.deepEqual(filterOrders(orders, { q: "b2", status: "" }).map((o) => o.id), ["B2"]);
  assert.deepEqual(filterOrders(orders, { q: "王小明", status: "delivered" }).map((o) => o.id), ["C3"]);
  assert.deepEqual(filterOrders(orders, { q: "", status: "" }).length, 3);
});

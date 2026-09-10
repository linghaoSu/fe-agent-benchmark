import assert from "node:assert/strict";
import test from "node:test";
import { reduceSort, sortRows } from "../src/sortRows.js";

const rows = [
  { id: 1, name: "B", department: "X", salary: 12000 },
  { id: 2, name: "A", department: "Y", salary: 900 },
  { id: 3, name: "C", department: "X", salary: 900 },
];

test("sortRows returns a new numerically sorted array and keeps ties in source order", () => {
  const before = JSON.stringify(rows);
  assert.deepEqual(sortRows(rows, { key: "salary", direction: "asc" }).map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(sortRows(rows, { key: "department", direction: "desc" }).map((r) => r.id), [2, 1, 3]);
  assert.equal(JSON.stringify(rows), before);
});

test("reduceSort toggles and resets direction", () => {
  assert.deepEqual(reduceSort({ key: "salary", direction: "asc" }, "salary"), { key: "salary", direction: "desc" });
  assert.deepEqual(reduceSort({ key: "salary", direction: "desc" }, "name"), { key: "name", direction: "asc" });
});

import assert from "node:assert/strict";
import test from "node:test";
import { nextSort, sortEmployees } from "../src/sorting.js";

const rows = [
  { id: 1, name: "B", department: "X", salary: 12000 },
  { id: 2, name: "A", department: "Y", salary: 900 },
  { id: 3, name: "C", department: "X", salary: 900 },
];

test("sortEmployees compares salaries numerically and never mutates the input", () => {
  const copy = rows.slice();
  assert.deepEqual(sortEmployees(rows, "salary", "asc").map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(sortEmployees(rows, "salary", "desc").map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(rows, copy);
  assert.notEqual(sortEmployees(rows, null), rows);
});

test("sortEmployees is stable in both directions", () => {
  assert.deepEqual(sortEmployees(rows, "department", "asc").map((r) => r.id), [1, 3, 2]);
  assert.deepEqual(sortEmployees(rows, "department", "desc").map((r) => r.id), [2, 1, 3]);
});

test("nextSort toggles direction on the same column and resets on a new one", () => {
  assert.deepEqual(nextSort({ key: null, direction: "asc" }, "name"), { key: "name", direction: "asc" });
  assert.deepEqual(nextSort({ key: "name", direction: "asc" }, "name"), { key: "name", direction: "desc" });
  assert.deepEqual(nextSort({ key: "name", direction: "desc" }, "salary"), { key: "salary", direction: "asc" });
});

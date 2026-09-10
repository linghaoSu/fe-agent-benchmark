import assert from "node:assert/strict";
import test from "node:test";
import { employees } from "../src/data/employees.js";

test("mock employees have 10 rows with duplicate departments and numeric salaries", () => {
  assert.equal(employees.length, 10);
  assert.ok(employees.every((employee) => typeof employee.salary === "number"));
  assert.ok(new Set(employees.map((employee) => employee.department)).size < employees.length);
  assert.ok(employees.some((employee) => employee.salary === 900) && employees.some((employee) => employee.salary === 12000));
});

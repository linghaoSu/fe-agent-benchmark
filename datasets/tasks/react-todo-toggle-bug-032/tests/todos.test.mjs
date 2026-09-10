import assert from "node:assert/strict";
import test from "node:test";
import { todos } from "../src/data/todos.js";

test("mock todos: 6 items with unique ids, 2 completed", () => {
  assert.equal(todos.length, 6);
  assert.equal(new Set(todos.map((todo) => todo.id)).size, 6);
  assert.equal(todos.filter((todo) => todo.completed).length, 2);
});

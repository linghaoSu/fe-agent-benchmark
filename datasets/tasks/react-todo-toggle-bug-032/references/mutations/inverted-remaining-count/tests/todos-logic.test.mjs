import assert from "node:assert/strict";
import test from "node:test";
import { filterTodos, remainingCount, toggleTodo } from "../src/todos-logic.js";

const todos = [
  { id: "a", title: "A", completed: false },
  { id: "b", title: "B", completed: true },
  { id: "c", title: "C", completed: false },
];

test("toggleTodo flips only the matching id and never mutates the input", () => {
  const next = toggleTodo(todos, "c");
  assert.deepEqual(next.map((t) => t.completed), [false, true, true]);
  assert.deepEqual(todos.map((t) => t.completed), [false, true, false]);
  assert.deepEqual(toggleTodo(next, "c"), todos);
});

test("filterTodos and remainingCount", () => {
  assert.deepEqual(filterTodos(todos, "active").map((t) => t.id), ["a", "c"]);
  assert.deepEqual(filterTodos(todos, "completed").map((t) => t.id), ["b"]);
  assert.equal(filterTodos(todos, "all").length, 3);
  assert.equal(remainingCount(todos), 2);
  assert.equal(remainingCount(toggleTodo(todos, "a")), 1);
});

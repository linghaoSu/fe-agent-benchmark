import assert from "node:assert/strict";
import test from "node:test";
import { initialState, reducer, selectRemaining, selectVisible } from "../src/store.js";

const todos = [
  { id: "a", title: "A", completed: false },
  { id: "b", title: "B", completed: true },
  { id: "c", title: "C", completed: false },
];

test("reducer toggles by id immutably and ignores unknown ids", () => {
  const start = initialState(todos);
  const next = reducer(start, { type: "toggle", id: "c" });
  assert.equal(next.byId.c.completed, true);
  assert.equal(start.byId.c.completed, false);
  assert.equal(todos[2].completed, false);
  assert.equal(reducer(start, { type: "toggle", id: "zzz" }), start);
  assert.deepEqual(selectVisible(reducer(next, { type: "toggle", id: "c" })), selectVisible(start));
});

test("selectors derive visible rows and remaining count from the filter", () => {
  const state = reducer(initialState(todos), { type: "filter", filter: "active" });
  assert.deepEqual(selectVisible(state).map((t) => t.id), ["a", "c"]);
  assert.deepEqual(selectVisible({ ...state, filter: "completed" }).map((t) => t.id), ["b"]);
  assert.equal(selectRemaining(state), 2);
  assert.equal(reducer(state, { type: "filter", filter: "bogus" }).filter, "active");
});

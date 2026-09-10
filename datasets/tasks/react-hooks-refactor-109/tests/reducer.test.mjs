import assert from "node:assert/strict";
import test from "node:test";
import { initialState, reducer } from "../src/reducer.js";

test("reducer is pure and handles increment, reset and addNote", () => {
  const afterTwo = reducer(reducer(initialState, { type: "increment" }), { type: "increment" });
  assert.equal(afterTwo.count, 2);
  assert.deepEqual(initialState, { count: 0, notes: [] });
  assert.equal(reducer(afterTwo, { type: "reset" }).count, 0);
  assert.deepEqual(reducer(initialState, { type: "addNote", text: "你好" }).notes, ["你好"]);
  assert.equal(reducer(initialState, { type: "unknown" }), initialState);
});

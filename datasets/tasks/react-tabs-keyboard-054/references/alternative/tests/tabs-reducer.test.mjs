import assert from "node:assert/strict";
import test from "node:test";
import { actionForKey, initialState, tabsReducer } from "../src/tabsReducer.js";

const ids = ["a", "b", "c", "d"];
const reduce = (state, action) => tabsReducer(ids, state, action);

test("keys map to actions", () => {
  assert.equal(actionForKey("ArrowRight"), "next");
  assert.equal(actionForKey("ArrowLeft"), "prev");
  assert.equal(actionForKey("Home"), "first");
  assert.equal(actionForKey("End"), "last");
  assert.equal(actionForKey(" "), "activate");
  assert.equal(actionForKey("Tab"), null);
});

test("next/prev wrap around and bump focusTick", () => {
  const start = initialState(ids);
  assert.equal(start.activeId, "a");
  assert.deepEqual(reduce(start, { type: "prev", focusedId: "a" }), { activeId: "d", focusTick: 1 });
  assert.deepEqual(reduce({ activeId: "d", focusTick: 1 }, { type: "next", focusedId: "d" }), { activeId: "a", focusTick: 2 });
});

test("first/last/select/activate", () => {
  assert.equal(reduce(initialState(ids), { type: "last", focusedId: "a" }).activeId, "d");
  assert.equal(reduce({ activeId: "d", focusTick: 3 }, { type: "first", focusedId: "d" }).activeId, "a");
  assert.deepEqual(reduce(initialState(ids), { type: "select", id: "c" }), { activeId: "c", focusTick: 0 });
  assert.equal(reduce(initialState(ids), { type: "select", id: "zzz" }).activeId, "a");
  assert.equal(reduce(initialState(ids), { type: "activate", focusedId: "b" }).activeId, "b");
});

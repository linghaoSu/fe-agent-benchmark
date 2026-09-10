import assert from "node:assert/strict";
import test from "node:test";
import { actions, initialState, reducer } from "../src/reducer.js";

const run = (...list) => list.reduce(reducer, initialState);

test("counter actions increment and reset without mutating input", () => {
  assert.equal(run(actions.increment(), actions.increment(), actions.increment()).count, 3);
  assert.equal(run(actions.increment(), actions.reset()).count, 0);
  assert.equal(initialState.count, 0);
});

test("committing a draft appends a trimmed note and clears the draft; blank drafts are ignored", () => {
  const state = run(actions.edit("  买牛奶 "), actions.commit());
  assert.deepEqual(state.notes.map((note) => note.text), ["买牛奶"]);
  assert.equal(state.draft, "");
  const blank = run(actions.edit("   "), actions.commit());
  assert.equal(blank.notes.length, 0);
  assert.equal(reducer(initialState, { type: "nope" }), initialState);
});

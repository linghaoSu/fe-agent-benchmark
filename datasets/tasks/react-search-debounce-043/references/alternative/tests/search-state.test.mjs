import assert from "node:assert/strict";
import test from "node:test";
import { initialSearchState, searchReducer } from "../src/searchState.js";

test("responses for a query other than the current one are ignored", () => {
  let state = searchReducer(initialSearchState, { type: "start", query: "an" });
  state = searchReducer(state, { type: "start", query: "ann" });
  const stale = searchReducer(state, { type: "resolve", query: "an", results: [1, 2, 3] });
  assert.equal(stale.status, "pending");
  assert.deepEqual(stale.results, []);
  const fresh = searchReducer(stale, { type: "resolve", query: "ann", results: [1] });
  assert.deepEqual(fresh, { status: "done", query: "ann", results: [1] });
});

test("reset returns to idle", () => {
  const state = searchReducer({ status: "done", query: "x", results: [1] }, { type: "reset" });
  assert.deepEqual(state, initialSearchState);
});

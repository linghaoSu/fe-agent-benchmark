import assert from "node:assert/strict";
import test from "node:test";
import { DEBOUNCE_MS, createRequestTracker, deriveView } from "../src/requestTracker.js";

test("only the most recent request id is current", () => {
  const tracker = createRequestTracker();
  const first = tracker.next();
  const second = tracker.next();
  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);
  assert.equal(tracker.latest, 2);
});

test("debounce delay is 150ms", () => assert.equal(DEBOUNCE_MS, 150));

test("deriveView shows all users for blank queries and empty state only once the current query has resolved empty", () => {
  const total = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(deriveView({ query: "  ", loading: true, rows: [], resolvedQuery: "", total }), { rows: total, showEmpty: false, loading: false });
  assert.equal(deriveView({ query: "zz", loading: false, rows: [], resolvedQuery: "", total }).showEmpty, false);
  assert.equal(deriveView({ query: "zz", loading: true, rows: [], resolvedQuery: "zz", total }).showEmpty, false);
  assert.equal(deriveView({ query: "zz", loading: false, rows: [], resolvedQuery: "zz", total }).showEmpty, true);
  assert.deepEqual(deriveView({ query: "a", loading: false, rows: [total[0]], resolvedQuery: "a", total }), { rows: [total[0]], showEmpty: false, loading: false });
});

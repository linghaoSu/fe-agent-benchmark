import assert from "node:assert/strict";
import test from "node:test";
import { pageCount, readPage, reducer } from "../src/pageState.js";

test("pageCount rounds up", () => {
  assert.equal(pageCount(23, 5), 5);
  assert.equal(pageCount(20, 5), 4);
  assert.equal(pageCount(0, 5), 1);
});

test("readPage clamps the URL page into range", () => {
  assert.equal(readPage("?page=3", 5), 3);
  assert.equal(readPage("?page=9", 5), 5);
  assert.equal(readPage("?page=0", 5), 1);
  assert.equal(readPage("?page=x", 5), 1);
  assert.equal(readPage("", 5), 1);
});

test("reducer refuses to step past either boundary", () => {
  const last = { page: 5, count: 5 };
  assert.equal(reducer(last, { type: "next" }), last);
  const first = { page: 1, count: 5 };
  assert.equal(reducer(first, { type: "prev" }), first);
  assert.deepEqual(reducer({ page: 2, count: 5 }, { type: "next" }), { page: 3, count: 5 });
  assert.deepEqual(reducer({ page: 2, count: 5 }, { type: "jump", page: "4" }), { page: 4, count: 5 });
});

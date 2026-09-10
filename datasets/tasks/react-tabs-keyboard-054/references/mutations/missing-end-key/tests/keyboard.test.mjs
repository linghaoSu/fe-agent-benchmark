import assert from "node:assert/strict";
import test from "node:test";
import { isActivationKey, nextTabIndex } from "../src/keyboard.js";

test("arrow keys move with wrap-around", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 4), 1);
  assert.equal(nextTabIndex("ArrowRight", 3, 4), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 4), 3);
  assert.equal(nextTabIndex("ArrowLeft", 2, 4), 1);
});

test("Home and End jump to the edges; other keys are ignored", () => {
  assert.equal(nextTabIndex("Home", 2, 4), 0);
  assert.equal(nextTabIndex("End", 0, 4), 3);
  assert.equal(nextTabIndex("ArrowDown", 1, 4), null);
  assert.equal(nextTabIndex("a", 1, 4), null);
});

test("Enter and Space activate", () => {
  assert.ok(isActivationKey("Enter"));
  assert.ok(isActivationKey(" "));
  assert.ok(!isActivationKey("Tab"));
});

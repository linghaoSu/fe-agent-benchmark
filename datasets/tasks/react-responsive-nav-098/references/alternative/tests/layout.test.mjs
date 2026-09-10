import assert from "node:assert/strict";
import test from "node:test";
import { BREAKPOINT, MOBILE_MEDIA, cardStyles, navStyles, reducer } from "../src/layout.js";

test("media query targets widths below the 768px breakpoint", () => {
  assert.equal(BREAKPOINT, 768);
  assert.equal(MOBILE_MEDIA, "(max-width: 767px)");
});

test("reducer toggles on mobile and closes the menu when leaving mobile", () => {
  let state = reducer({ mobile: true, open: false }, { type: "toggle" });
  assert.deepEqual(state, { mobile: true, open: true });
  state = reducer(state, { type: "viewport", mobile: false });
  assert.deepEqual(state, { mobile: false, open: false });
  assert.deepEqual(reducer(state, { type: "unknown" }), state);
});

test("styles never use fixed pixel widths and stack on mobile", () => {
  assert.equal(cardStyles(true).card.flex, "1 1 100%");
  assert.equal(cardStyles(false).card.flex, "1 1 0");
  assert.equal(navStyles(true).list.flexDirection, "column");
  assert.equal(navStyles(false).list.flexDirection, "row");
  for (const group of [navStyles(true), navStyles(false), cardStyles(true), cardStyles(false)]) {
    for (const style of Object.values(group)) assert.equal(style.width, undefined);
  }
});

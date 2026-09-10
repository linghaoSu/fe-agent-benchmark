import assert from "node:assert/strict";
import test from "node:test";
import { MOBILE_QUERY, isMobileWidth, navListVisible, styles, toggleLabel } from "../src/responsive.js";

test("mobile breakpoint is below 768px", () => {
  assert.equal(MOBILE_QUERY, "(max-width: 767px)");
  assert.equal(isMobileWidth(375), true);
  assert.equal(isMobileWidth(767), true);
  assert.equal(isMobileWidth(768), false);
  assert.equal(isMobileWidth(1440), false);
});

test("nav list is always visible on desktop and only when open on mobile", () => {
  assert.equal(navListVisible({ mobile: false, open: false }), true);
  assert.equal(navListVisible({ mobile: true, open: false }), false);
  assert.equal(navListVisible({ mobile: true, open: true }), true);
});

test("toggle label reflects state and stylesheet contains the mobile media query", () => {
  assert.notEqual(toggleLabel(true), toggleLabel(false));
  assert.match(styles(), /@media \(max-width: 767px\)/);
  assert.doesNotMatch(styles(), /420px/);
});

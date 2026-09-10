import assert from "node:assert/strict";
import test from "node:test";
import { cards, navLinks } from "../src/data/nav.js";

test("navigation data has 7 links with unique anchors and 3 cards", () => {
  assert.equal(navLinks.length, 7);
  assert.equal(new Set(navLinks.map((link) => link.href)).size, 7);
  assert.ok(navLinks.every((link) => link.label && link.href.startsWith("#")));
  assert.equal(cards.length, 3);
});

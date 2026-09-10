import assert from "node:assert/strict";
import test from "node:test";
import { tabs } from "../src/data/tabs.js";

test("mock tabs have four entries with unique ids, labels and panel text", () => {
  assert.equal(tabs.length, 4);
  assert.equal(new Set(tabs.map((tab) => tab.id)).size, 4);
  for (const tab of tabs) { assert.ok(tab.label.trim()); assert.ok(tab.panel.trim()); }
});

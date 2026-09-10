import assert from "node:assert/strict";
import test from "node:test";
import { FIELDS } from "../src/data/fields.js";

test("registration form declares the four required fields in order", () => {
  assert.deepEqual(FIELDS.map((field) => field.name), ["username", "email", "password", "confirm"]);
  for (const field of FIELDS) assert.ok(field.label.length > 0);
});

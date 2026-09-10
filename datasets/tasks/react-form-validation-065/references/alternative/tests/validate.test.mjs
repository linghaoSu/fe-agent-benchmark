import assert from "node:assert/strict";
import test from "node:test";
import { RULES, isValid, validateForm } from "../src/validate.js";

const valid = { username: "zhang_san1", email: "zhang@example.com", password: "abc12345", confirm: "abc12345" };

test("rule table covers every field and reports the first failing rule per field", () => {
  assert.deepEqual([...new Set(RULES.map((rule) => rule.field))], ["username", "email", "password", "confirm"]);
  assert.deepEqual(validateForm(valid), {});
  assert.equal(isValid(valid), true);
  const errors = validateForm({ username: "", email: "", password: "", confirm: "" });
  assert.deepEqual(Object.keys(errors).sort(), ["confirm", "email", "password", "username"]);
  for (const message of Object.values(errors)) assert.match(message, /[一-鿿]/);
});

test("individual rules reject the documented bad inputs", () => {
  assert.deepEqual(Object.keys(validateForm({ ...valid, username: "ab" })), ["username"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, username: "bad name" })), ["username"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, email: "not-an-email" })), ["email"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, email: "a@b" })), ["email"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, email: "a@@b.com" })), ["email"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, password: "abc1", confirm: "abc1" })), ["password"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, password: "abcdefgh", confirm: "abcdefgh" })), ["password"]);
  assert.deepEqual(Object.keys(validateForm({ ...valid, confirm: "abc12346" })), ["confirm"]);
});

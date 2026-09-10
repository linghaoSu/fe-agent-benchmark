import assert from "node:assert/strict";
import test from "node:test";
import { validateEmail, validateForm, validatePassword, validateUsername } from "../src/validate.js";

const valid = { username: "zhang_san1", email: "zhang@example.com", password: "abc12345", confirm: "abc12345" };

test("field validators follow the documented rules", () => {
  assert.equal(validateUsername("ab"), false);
  assert.equal(validateUsername("abc"), true);
  assert.equal(validateUsername("a".repeat(17)), false);
  assert.equal(validateUsername("张三"), false);
  assert.equal(validateEmail("not-an-email"), false);
  assert.equal(validateEmail("a@b"), false);
  assert.equal(validateEmail("a@@b.com"), false);
  assert.equal(validateEmail("a@b.com"), true);
  assert.equal(validatePassword("abc1"), false);
  assert.equal(validatePassword("abcdefgh"), false);
  assert.equal(validatePassword("12345678"), false);
  assert.equal(validatePassword("abc12345"), true);
});

test("validateForm returns Chinese messages only for invalid fields", () => {
  assert.deepEqual(validateForm(valid), {});
  const errors = validateForm({ username: "", email: "", password: "", confirm: "" });
  assert.deepEqual(Object.keys(errors).sort(), ["confirm", "email", "password", "username"]);
  for (const message of Object.values(errors)) assert.match(message, /[一-鿿]/);
  assert.deepEqual(Object.keys(validateForm({ ...valid, confirm: "abc12346" })), ["confirm"]);
});

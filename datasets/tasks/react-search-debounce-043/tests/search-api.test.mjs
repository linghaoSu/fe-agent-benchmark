import assert from "node:assert/strict";
import test from "node:test";
import { users } from "../src/data/users.js";
import { delayFor, searchUsers } from "../src/api/searchUsers.js";

test("mock users: 12 entries with unique ids and name/email/role", () => {
  assert.equal(users.length, 12);
  assert.equal(new Set(users.map((user) => user.id)).size, 12);
  for (const user of users) assert.ok(user.name && user.email && user.role);
});

test("shorter queries resolve slower", () => {
  assert.ok(delayFor("a") > delayFor("ab"));
  assert.ok(delayFor("ab") > delayFor("abcd"));
  assert.equal(delayFor("abcdef"), 60);
  assert.equal(delayFor(""), 900);
});

test("searchUsers returns a promise, resolves all users for an empty query and rejects when aborted", async () => {
  const controller = new AbortController();
  const aborted = searchUsers("zz", { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, (error) => error.name === "AbortError");
  const pending = searchUsers("");
  assert.ok(pending instanceof Promise);
  assert.equal((await pending).length, 12);
});

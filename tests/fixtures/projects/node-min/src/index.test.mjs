import test from "node:test";
import assert from "node:assert/strict";
import { value } from "./index.mjs";
test("value remains valid", () => assert.equal(value, 2));

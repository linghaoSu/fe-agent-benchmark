import assert from "node:assert/strict";
import test from "node:test";
import { cartItems } from "../src/data/cart.js";

test("cart items use integer cents and quantities within 1..99", () => {
  assert.equal(new Set(cartItems.map((item) => item.id)).size, cartItems.length);
  for (const item of cartItems) {
    assert.ok(Number.isInteger(item.unitPrice) && item.unitPrice > 0, `${item.id} unitPrice must be integer cents`);
    assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99, `${item.id} quantity out of range`);
  }
});

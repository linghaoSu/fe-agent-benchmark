import assert from "node:assert/strict";
import test from "node:test";
import { orders } from "../src/data/orders.js";

test("mock orders cover every status", () => assert.deepEqual(new Set(orders.map((order) => order.status)), new Set(["pending", "shipped", "delivered"])));

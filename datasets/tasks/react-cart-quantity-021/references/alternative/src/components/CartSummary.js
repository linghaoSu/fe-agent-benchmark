import React from "/vendor/react.js";
import { formatYuan } from "../money.js";

export function CartSummary({ cents, count }) {
  return React.createElement("dl", { style: { display: "flex", flexWrap: "wrap", gap: "16px", margin: "12px 0" } },
    React.createElement("div", null, React.createElement("dt", null, "商品数量"), React.createElement("dd", { "data-testid": "item-count", style: { margin: 0 } }, count)),
    React.createElement("div", null, React.createElement("dt", null, "合计"), React.createElement("dd", { "data-testid": "cart-total", style: { margin: 0, fontWeight: "bold" } }, formatYuan(cents))));
}

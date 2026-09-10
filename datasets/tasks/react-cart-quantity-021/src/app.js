import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cartItems } from "./data/cart.js";

function App() {
  return React.createElement("section", null,
    React.createElement("h1", null, "购物车"),
    React.createElement("ul", { style: { listStyle: "none", padding: 0, margin: 0 } },
      cartItems.map((item) => React.createElement("li", { key: item.id, "data-testid": "cart-row", style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "8px 0", borderBottom: "1px solid #ddd" } },
        React.createElement("span", null, item.name),
        React.createElement("span", null, `单价 ${item.unitPrice} 分`),
        React.createElement("span", { "data-testid": "qty-value" }, item.quantity)))),
    React.createElement("footer", { style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px 0" } },
      React.createElement("span", null, "共 ", React.createElement("span", { "data-testid": "item-count" }, 0), " 件"),
      React.createElement("span", null, "合计 ", React.createElement("strong", { "data-testid": "cart-total" }, "¥0.00"))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

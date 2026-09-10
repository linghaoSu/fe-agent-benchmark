import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cartItems } from "./data/cart.js";
import { changeQuantity, formatCents, itemCount, removeItem, totalCents } from "./cart.js";

const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid #ddd" };

function App() {
  const [items, setItems] = React.useState(cartItems);
  const adjust = (id, delta) => () => setItems((current) => changeQuantity(current, id, delta));
  const remove = (id) => () => setItems((current) => removeItem(current, id));
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "购物车"),
    items.length === 0
      ? React.createElement("p", { "data-testid": "empty-cart", role: "status" }, "购物车是空的")
      : React.createElement("ul", { "aria-label": "购物车商品", style: { listStyle: "none", padding: 0, margin: 0 } },
        items.map((item) => React.createElement("li", { key: item.id, "data-testid": "cart-row", style: rowStyle },
          React.createElement("span", { style: { flex: "1 1 120px" } }, item.name),
          React.createElement("span", null, formatCents(item.unitPrice)),
          React.createElement("button", { type: "button", "data-testid": "qty-decrement", "aria-label": `减少 ${item.name} 数量`, onClick: adjust(item.id, -1) }, React.createElement("span", { "aria-hidden": "true" }, "−")),
          React.createElement("span", { "data-testid": "qty-value" }, item.quantity),
          React.createElement("button", { type: "button", "data-testid": "qty-increment", "aria-label": `增加 ${item.name} 数量`, onClick: adjust(item.id, 1) }, React.createElement("span", { "aria-hidden": "true" }, "+")),
          React.createElement("button", { type: "button", "data-testid": "remove-item", "aria-label": `删除 ${item.name}`, onClick: remove(item.id) }, React.createElement("span", { "aria-hidden": "true" }, "✕"))))),
    React.createElement("footer", { style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "12px 0" } },
      React.createElement("span", null, "共 ", React.createElement("span", { "data-testid": "item-count" }, itemCount(items)), " 件"),
      React.createElement("span", null, "合计 ", React.createElement("strong", { "data-testid": "cart-total" }, `¥${(totalCents(items) / 100).toFixed(2)}`))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

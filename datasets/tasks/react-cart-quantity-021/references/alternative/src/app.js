import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cartItems } from "./data/cart.js";
import { cartReducer, selectItems, selectSummary, toState } from "./store/cartReducer.js";
import { CartRow } from "./components/CartRow.js";
import { CartSummary } from "./components/CartSummary.js";

function App() {
  const [state, dispatch] = React.useReducer(cartReducer, cartItems, toState);
  const items = React.useMemo(() => selectItems(state), [state]);
  const summary = React.useMemo(() => selectSummary(state), [state]);
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "购物车"),
    items.length
      ? React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
        React.createElement("caption", { style: { textAlign: "left", marginBottom: "8px" } }, "购物车商品"),
        React.createElement("thead", null, React.createElement("tr", null,
          React.createElement("th", { scope: "col", style: { textAlign: "left" } }, "商品"),
          React.createElement("th", { scope: "col" }, "数量"),
          React.createElement("th", { scope: "col" }, "操作"))),
        React.createElement("tbody", null, items.map((item) => React.createElement(CartRow, { key: item.id, item, dispatch }))))
      : React.createElement("p", { "data-testid": "empty-cart", role: "status", "aria-live": "polite" }, "购物车还没有商品"),
    React.createElement(CartSummary, summary));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

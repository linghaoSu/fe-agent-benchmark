import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { orders } from "./data/orders.js";

const labels = { pending: "待处理", shipped: "已发货", delivered: "已送达" };
function App() {
  return React.createElement("section", null,
    React.createElement("h1", null, "订单列表"),
    React.createElement("div", { "data-testid": "loading-state" }, "加载中…"),
    React.createElement("table", null, React.createElement("tbody", null, orders.map((order) => React.createElement("tr", { key: order.id, "data-testid": "order-row" }, React.createElement("td", null, order.id), React.createElement("td", null, order.customer), React.createElement("td", null, labels[order.status]))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

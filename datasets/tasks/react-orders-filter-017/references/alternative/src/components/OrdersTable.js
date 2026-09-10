import React from "/vendor/react.js";
import { STATUS_LABELS } from "./Filters.js";

export function OrdersTable({ orders }) {
  if (!orders.length) return React.createElement("p", { "data-testid": "empty-state", role: "status" }, "没有匹配的订单");
  return React.createElement("ul", { "aria-label": "订单列表", style: { listStyle: "none", padding: 0, margin: 0, maxWidth: "100%" } },
    orders.map((order) => React.createElement("li", { key: order.id, "data-testid": "order-row", style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "8px 0", borderBottom: "1px solid #ddd", overflowWrap: "anywhere" } },
      React.createElement("span", null, order.id),
      React.createElement("span", null, order.customer),
      React.createElement("span", null, STATUS_LABELS[order.status]))));
}

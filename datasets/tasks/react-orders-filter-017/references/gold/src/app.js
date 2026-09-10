import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { orders } from "./data/orders.js";

const labels = { pending: "待处理", shipped: "已发货", delivered: "已送达" };
const states = ["", "pending", "shipped", "delivered"];
function initial() {
  const query = new URLSearchParams(location.search);
  return { q: query.get("q") || "", status: states.includes(query.get("status")) ? query.get("status") : "" };
}
function App() {
  const [filters, setFilters] = React.useState(initial);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { const timer = setTimeout(() => setLoading(false), 0); return () => clearTimeout(timer); }, []);
  React.useEffect(() => { history.replaceState(null, "", `?q=${encodeURIComponent(filters.q)}&status=${filters.status}`); }, [filters]);
  const visible = orders.filter((order) => (!filters.q || `${order.id}${order.customer}`.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.status || order.status === filters.status));
  const change = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));
  return React.createElement("section", null,
    React.createElement("h1", null, "订单列表"),
    React.createElement("input", { "data-testid": "search-input", value: filters.q, onChange: change("q"), placeholder: "搜索订单或客户" }),
    React.createElement("select", { "data-testid": "status-filter", value: filters.status, onChange: change("status") },
      React.createElement("option", { value: "" }, "全部"),
      React.createElement("option", { value: "pending" }, "待处理"),
      React.createElement("option", { value: "shipped" }, "已发货"),
      React.createElement("option", { value: "delivered" }, "已送达")),
    loading ? React.createElement("p", { "data-testid": "loading-state" }, "加载中…") : null,
    visible.length ? React.createElement("table", null, React.createElement("tbody", null, visible.map((order) => React.createElement("tr", { key: order.id, "data-testid": "order-row" }, React.createElement("td", null, order.id), React.createElement("td", null, order.customer), React.createElement("td", null, labels[order.status]))))) : React.createElement("p", { "data-testid": "empty-state" }, "没有匹配的订单"));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

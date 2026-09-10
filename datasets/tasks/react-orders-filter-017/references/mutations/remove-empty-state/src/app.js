import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { orders } from "./data/orders.js";
import { filterOrders, parseFilters } from "./filters.js";

const labels = { pending: "待处理", shipped: "已发货", delivered: "已送达" };
function initial() { return parseFilters(location.search); }
function App() {
  const [filters, setFilters] = React.useState(initial);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { const timer = setTimeout(() => setLoading(false), 0); return () => clearTimeout(timer); }, []);
  React.useEffect(() => { history.replaceState(null, "", `?q=${encodeURIComponent(filters.q)}&status=${filters.status}`); }, [filters]);
  const visible = filterOrders(orders, filters);
  const change = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));
  return React.createElement("section", null,
    React.createElement("h1", null, "订单列表"),
    React.createElement("input", { "data-testid": "search-input", "aria-label": "搜索订单或客户", value: filters.q, onChange: change("q"), placeholder: "搜索订单或客户" }),
    React.createElement("select", { "data-testid": "status-filter", "aria-label": "订单状态筛选", value: filters.status, onChange: change("status") },
      React.createElement("option", { value: "" }, "全部"),
      React.createElement("option", { value: "pending" }, "待处理"),
      React.createElement("option", { value: "shipped" }, "已发货"),
      React.createElement("option", { value: "delivered" }, "已送达")),
    loading ? React.createElement("p", { "data-testid": "loading-state" }, "加载中…") : null,
    visible.length ? React.createElement("table", null, React.createElement("tbody", null, visible.map((order) => React.createElement("tr", { key: order.id, "data-testid": "order-row" }, React.createElement("td", null, order.id), React.createElement("td", null, order.customer), React.createElement("td", null, labels[order.status]))))) : null);
}
createRoot(document.getElementById("root")).render(React.createElement(App));

import React from "/vendor/react.js";

export const STATUS_LABELS = { pending: "待处理", shipped: "已发货", delivered: "已送达" };

export function Filters({ state, dispatch }) {
  return React.createElement("form", { role: "search", "aria-label": "订单筛选", onSubmit: (event) => event.preventDefault(), style: { display: "flex", flexWrap: "wrap", gap: "8px", maxWidth: "100%" } },
    React.createElement("label", { htmlFor: "order-search", style: { display: "flex", flexDirection: "column", flex: "1 1 200px", minWidth: 0 } },
      React.createElement("span", null, "搜索"),
      React.createElement("input", { id: "order-search", type: "search", "data-testid": "search-input", "aria-label": "搜索订单或客户", placeholder: "订单号或客户名称", value: state.q, onChange: (event) => dispatch({ type: "query", value: event.target.value }), style: { width: "100%", boxSizing: "border-box" } })),
    React.createElement("label", { htmlFor: "order-status", style: { display: "flex", flexDirection: "column", flex: "0 1 160px", minWidth: 0 } },
      React.createElement("span", null, "状态"),
      React.createElement("select", { id: "order-status", "data-testid": "status-filter", "aria-label": "订单状态筛选", value: state.status, onChange: (event) => dispatch({ type: "status", value: event.target.value }), style: { width: "100%" } },
        React.createElement("option", { value: "" }, "全部"),
        Object.entries(STATUS_LABELS).map(([value, label]) => React.createElement("option", { key: value, value }, label)))));
}

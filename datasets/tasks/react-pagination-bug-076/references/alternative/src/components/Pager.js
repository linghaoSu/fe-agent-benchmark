import React from "/vendor/react.js";

export function Pager({ page, count, dispatch }) {
  const button = (testid, label, type, disabled) => React.createElement("button", {
    type: "button", "data-testid": testid, disabled, "aria-disabled": disabled ? "true" : undefined,
    onClick: () => dispatch({ type }), style: { padding: "6px 12px" },
  }, label);
  return React.createElement("nav", { "aria-label": "商品分页", style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginTop: "12px" } },
    button("prev-page", "上一页", "prev", page <= 1),
    React.createElement("output", { "data-testid": "page-indicator", "aria-live": "polite" }, `第 ${page} / ${count} 页`),
    button("next-page", "下一页", "next", page >= count));
}

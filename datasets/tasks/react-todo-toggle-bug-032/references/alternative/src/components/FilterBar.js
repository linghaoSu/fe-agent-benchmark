import React from "/vendor/react.js";

export const FILTER_LABELS = { all: "全部", active: "未完成", completed: "已完成" };

export function FilterBar({ filter, remaining, dispatch }) {
  return React.createElement("form", { onSubmit: (event) => event.preventDefault(), style: { display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", maxWidth: "100%" } },
    React.createElement("label", { htmlFor: "todo-filter" }, "显示：",
      React.createElement("select", { id: "todo-filter", "data-testid": "todo-filter", value: filter, onChange: (event) => dispatch({ type: "filter", filter: event.target.value }) },
        Object.entries(FILTER_LABELS).map(([value, label]) => React.createElement("option", { key: value, value }, label)))),
    React.createElement("output", { "data-testid": "remaining-count", htmlFor: "todo-filter", "aria-live": "polite" }, "剩余 ", remaining, " 项"));
}

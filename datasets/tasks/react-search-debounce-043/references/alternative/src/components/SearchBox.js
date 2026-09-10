import React from "/vendor/react.js";

export function SearchBox({ value, onChange }) {
  return React.createElement("form", { role: "search", onSubmit: (event) => event.preventDefault(), style: { display: "flex", flexDirection: "column", gap: "4px", maxWidth: "100%" } },
    React.createElement("label", { htmlFor: "user-search" }, "搜索用户"),
    React.createElement("input", { id: "user-search", type: "search", "data-testid": "search-input", value, onChange: (event) => onChange(event.target.value), placeholder: "姓名或邮箱", style: { width: "100%", boxSizing: "border-box" } }));
}

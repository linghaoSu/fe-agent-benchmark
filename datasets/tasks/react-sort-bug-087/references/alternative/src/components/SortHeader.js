import React from "/vendor/react.js";

export const COLUMNS = [
  { key: "name", label: "姓名" },
  { key: "department", label: "部门" },
  { key: "salary", label: "薪资" },
];

export function SortHeader({ sort, onToggle }) {
  return React.createElement("div", { role: "row", style: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: "8px", fontWeight: 600 } },
    COLUMNS.map((column) => {
      const active = sort.key === column.key;
      const props = { key: column.key, role: "columnheader" };
      if (active) props["aria-sort"] = sort.direction === "asc" ? "ascending" : "descending";
      return React.createElement("div", props,
        React.createElement("button", {
          type: "button",
          "data-testid": `sort-${column.key}`,
          "aria-label": `按${column.label}排序`,
          onClick: () => onToggle(column.key),
          style: { background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" },
        }, column.label),
        active ? React.createElement("span", { "data-testid": "sort-indicator", "aria-hidden": "true" }, sort.direction === "asc" ? "↑" : "↓") : null);
    }));
}

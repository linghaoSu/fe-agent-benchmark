import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { employees } from "./data/employees.js";

const columns = [
  { key: "name", label: "姓名" },
  { key: "department", label: "部门" },
  { key: "salary", label: "薪资" },
];

function sortEmployees(list, key, direction) {
  if (!key) return list;
  const sorted = list.sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0));
  return direction === "desc" ? sorted.reverse() : sorted;
}

function App() {
  const [sort, setSort] = React.useState({ key: null, direction: "asc" });
  const toggle = (key) => setSort((current) => (current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  const rows = sortEmployees(employees, sort.key, sort.direction);
  return React.createElement("section", null,
    React.createElement("h1", null, "员工列表"),
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
      React.createElement("thead", null, React.createElement("tr", null, columns.map((column) => React.createElement("th", { key: column.key, style: { textAlign: "left" } },
        React.createElement("button", { type: "button", "data-testid": `sort-${column.key}`, onClick: () => toggle(column.key) },
          column.label,
          sort.key === column.key ? React.createElement("span", { "data-testid": "sort-indicator", "aria-hidden": "true" }, sort.direction === "asc" ? " ▲" : " ▼") : null))))),
      React.createElement("tbody", null, rows.map((employee) => React.createElement("tr", { key: employee.id, "data-testid": "employee-row" },
        React.createElement("td", { "data-testid": "employee-name" }, employee.name),
        React.createElement("td", { "data-testid": "employee-department" }, employee.department),
        React.createElement("td", { "data-testid": "employee-salary" }, employee.salary))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

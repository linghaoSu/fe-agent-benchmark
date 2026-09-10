import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { employees } from "./data/employees.js";
import { nextSort, sortEmployees } from "./sorting.js";

const columns = [
  { key: "name", label: "姓名" },
  { key: "department", label: "部门" },
  { key: "salary", label: "薪资" },
];
const ariaSort = { asc: "ascending", desc: "descending" };

function App() {
  const [sort, setSort] = React.useState({ key: null, direction: "asc" });
  const rows = React.useMemo(() => sortEmployees(employees, sort.key, sort.direction), [sort]);
  return React.createElement("section", null,
    React.createElement("h1", null, "员工列表"),
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
      React.createElement("thead", null, React.createElement("tr", null, columns.map((column) => {
        const active = sort.key === column.key;
        return React.createElement("th", { key: column.key, scope: "col", "aria-sort": active ? ariaSort[sort.direction] : "none", style: { textAlign: "left" } },
          React.createElement("button", { type: "button", "data-testid": `sort-${column.key}`, onClick: () => setSort((current) => nextSort(current, column.key)) },
            active ? React.createElement("span", { "data-testid": "sort-indicator", "aria-hidden": "true" }, sort.direction === "asc" ? "▲" : "▼") : null));
      }))),
      React.createElement("tbody", null, rows.map((employee) => React.createElement("tr", { key: employee.id, "data-testid": "employee-row" },
        React.createElement("td", { "data-testid": "employee-name" }, employee.name),
        React.createElement("td", { "data-testid": "employee-department" }, employee.department),
        React.createElement("td", { "data-testid": "employee-salary" }, employee.salary))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

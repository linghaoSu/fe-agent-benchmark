import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { employees } from "./data/employees.js";
import { useSortedRows } from "./useSortedRows.js";
import { SortHeader } from "./components/SortHeader.js";
import { EmployeeList } from "./components/EmployeeList.js";

function App() {
  const { sort, toggle, rows } = useSortedRows(employees);
  return React.createElement("main", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "员工列表"),
    React.createElement("div", { role: "table", "aria-label": "员工列表" },
      React.createElement(SortHeader, { sort, onToggle: toggle }),
      React.createElement(EmployeeList, { rows })));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

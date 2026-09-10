import React from "/vendor/react.js";

export function EmployeeList({ rows }) {
  return React.createElement("ul", { role: "rowgroup", style: { listStyle: "none", margin: 0, padding: 0 } },
    rows.map((employee) => React.createElement("li", { key: employee.id, role: "row", "data-testid": "employee-row", style: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: "8px", padding: "6px 0", borderBottom: "1px solid #e5e5e5" } },
      React.createElement("span", { role: "cell", "data-testid": "employee-name" }, employee.name),
      React.createElement("span", { role: "cell", "data-testid": "employee-department" }, employee.department),
      React.createElement("span", { role: "cell", "data-testid": "employee-salary" }, String(employee.salary)))));
}

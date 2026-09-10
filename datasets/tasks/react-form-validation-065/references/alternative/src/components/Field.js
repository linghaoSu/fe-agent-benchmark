import React from "/vendor/react.js";

export function Field({ field, value, error, onChange }) {
  const inputId = `reg-${field.name}`;
  const errorId = `reg-${field.name}-hint`;
  const props = { id: inputId, name: field.name, type: field.type, autoComplete: field.autoComplete, "data-testid": field.name, value, onChange, style: { width: "100%", boxSizing: "border-box", padding: "6px" } };
  if (error) { props["aria-invalid"] = "true"; props["aria-describedby"] = errorId; }
  return React.createElement("li", { style: { listStyle: "none", display: "grid", gap: "4px" } },
    React.createElement("label", { htmlFor: inputId, style: { fontWeight: 600 } }, field.label),
    React.createElement("input", props),
    error && React.createElement("span", { id: errorId, "data-testid": `error-${field.name}`, role: "alert", style: { color: "#c0392b", fontSize: "13px" } }, error));
}

import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { FIELDS } from "./data/fields.js";

const empty = Object.fromEntries(FIELDS.map((field) => [field.name, ""]));
function App() {
  const [values, setValues] = React.useState(empty);
  const [status, setStatus] = React.useState("");
  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));
  const submit = (event) => { event.preventDefault(); setStatus("已提交"); };
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "注册"),
    React.createElement("form", { "data-testid": "register-form", noValidate: true, onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "360px" } },
      FIELDS.map((field) => React.createElement("div", { key: field.name, style: { display: "flex", flexDirection: "column", gap: "4px" } },
        React.createElement("label", { htmlFor: `field-${field.name}` }, field.label),
        React.createElement("input", { id: `field-${field.name}`, name: field.name, type: field.type, autoComplete: field.autoComplete, "data-testid": field.name, value: values[field.name], onChange: change(field.name), style: { width: "100%", boxSizing: "border-box" } }))),
      React.createElement("button", { type: "submit", "data-testid": "submit" }, "注册"),
      React.createElement("p", { "data-testid": "form-status", role: "status", "aria-live": "polite" }, status)));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

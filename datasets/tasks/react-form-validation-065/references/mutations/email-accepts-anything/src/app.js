import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { FIELDS } from "./data/fields.js";
import { validateForm } from "./validate.js";

const empty = Object.fromEntries(FIELDS.map((field) => [field.name, ""]));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function App() {
  const [values, setValues] = React.useState(empty);
  const [errors, setErrors] = React.useState({});
  const [status, setStatus] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const next = validateForm(values);
    if (values.email) delete next.email;
    setErrors(next);
    if (Object.keys(next).length > 0) { setStatus("请修正表单中的错误"); return; }
    setSubmitting(true);
    setStatus("提交中…");
    await wait(100);
    setSubmitting(false);
    setStatus("提交成功");
  };
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "注册"),
    React.createElement("form", { "data-testid": "register-form", noValidate: true, onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "360px" } },
      FIELDS.map((field) => {
        const id = `field-${field.name}`;
        const errorId = `${id}-error`;
        const error = errors[field.name];
        return React.createElement("div", { key: field.name, style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("label", { htmlFor: id }, field.label),
          React.createElement("input", { id, name: field.name, type: field.type, autoComplete: field.autoComplete, "data-testid": field.name, value: values[field.name], onChange: change(field.name), "aria-invalid": error ? "true" : undefined, "aria-describedby": error ? errorId : undefined, style: { width: "100%", boxSizing: "border-box" } }),
          error ? React.createElement("p", { id: errorId, "data-testid": `error-${field.name}`, role: "alert", style: { color: "#b91c1c", margin: 0, fontSize: "14px" } }, error) : null);
      }),
      React.createElement("button", { type: "submit", "data-testid": "submit", disabled: submitting }, submitting ? "提交中…" : "注册"),
      React.createElement("p", { "data-testid": "form-status", role: "status", "aria-live": "polite" }, status)));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

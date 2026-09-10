import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { FIELDS } from "./data/fields.js";
import { Field } from "./components/Field.js";
import { useRegistration } from "./hooks/useRegistration.js";

const STATUS_TEXT = { idle: "", invalid: "表单存在错误，请检查后重试", submitting: "正在提交…", success: "提交成功" };

function RegisterForm() {
  const [state, dispatch] = useRegistration(FIELDS, 100);
  const busy = state.phase === "submitting";
  return React.createElement("form", {
    "data-testid": "register-form", noValidate: true, "aria-busy": busy,
    onSubmit: (event) => { event.preventDefault(); if (!busy) dispatch({ type: "submit" }); },
    style: { width: "100%", maxWidth: "320px", boxSizing: "border-box" },
  },
    React.createElement("fieldset", { disabled: busy, style: { border: "1px solid #ddd", borderRadius: "6px", padding: "12px", minWidth: 0 } },
      React.createElement("legend", null, "账号信息"),
      React.createElement("ul", { style: { margin: 0, padding: 0, display: "grid", gap: "10px" } },
        FIELDS.map((field) => React.createElement(Field, {
          key: field.name, field, value: state.values[field.name], error: state.errors[field.name],
          onChange: (event) => dispatch({ type: "edit", field: field.name, value: event.target.value }),
        })))),
    React.createElement("button", { type: "submit", "data-testid": "submit", disabled: busy, style: { marginTop: "12px" } }, busy ? "提交中" : "创建账号"),
    React.createElement("output", { "data-testid": "form-status", "aria-live": "polite", style: { display: "block", marginTop: "8px" } }, STATUS_TEXT[state.phase]));
}

function App() {
  return React.createElement("section", { style: { padding: "12px", maxWidth: "100%", boxSizing: "border-box" } },
    React.createElement("h1", null, "创建新账号"),
    React.createElement(RegisterForm));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

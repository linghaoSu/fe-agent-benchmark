import React from "/vendor/react.js";
import { validateForm } from "../validate.js";

export const initialState = (fields) => ({ values: Object.fromEntries(fields.map((f) => [f.name, ""])), errors: {}, phase: "idle" });

export function reducer(state, action) {
  switch (action.type) {
    case "edit": return { ...state, values: { ...state.values, [action.field]: action.value } };
    case "submit": {
      const errors = validateForm(state.values);
      return { ...state, errors, phase: Object.keys(errors).length ? "invalid" : "submitting" };
    }
    case "done": return state.phase === "submitting" ? { ...state, phase: "success" } : state;
    default: return state;
  }
}

export function useRegistration(fields, delayMs) {
  const [state, dispatch] = React.useReducer(reducer, fields, initialState);
  React.useEffect(() => {
    if (state.phase !== "submitting") return undefined;
    const timer = setTimeout(() => dispatch({ type: "done" }), delayMs);
    return () => clearTimeout(timer);
  }, [state.phase, delayMs]);
  return [state, dispatch];
}

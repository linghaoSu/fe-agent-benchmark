import React from "/vendor/react.js";
import { initialState, reducer } from "../reducer.js";

export function useDashboard() {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [draft, setDraft] = React.useState("");
  const increment = React.useCallback(() => dispatch({ type: "increment" }), []);
  const reset = React.useCallback(() => dispatch({ type: "reset" }), []);
  const addNote = React.useCallback(() => {
    const text = draft.trim();
    if (text) dispatch({ type: "addNote", text });
  }, [draft]);
  return { count: state.count, notes: state.notes, draft, setDraft, increment, reset, addNote };
}

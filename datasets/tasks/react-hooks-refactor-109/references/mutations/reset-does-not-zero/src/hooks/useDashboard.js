import React from "/vendor/react.js";
import { initialState, reducer } from "../reducer.js";

export function useDashboard() {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [draft, setDraft] = React.useState("");
  const increment = React.useCallback(() => dispatch({ type: "increment" }), []);
  const reset = React.useCallback(() => dispatch({ type: "resetCount" }), []);
  const addNote = React.useCallback(() => {
    dispatch({ type: "addNote", text: draft });
    setDraft("");
  }, [draft]);
  return { count: state.count, notes: state.notes, draft, setDraft, increment, reset, addNote };
}

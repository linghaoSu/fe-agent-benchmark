import React from "/vendor/react.js";
import { initialState, reducer } from "../reducer.js";

let snapshot = initialState;

export function useDashboard() {
  const [state, dispatch] = React.useReducer((current, action) => reducer(snapshot, action), initialState);
  const [draft, setDraft] = React.useState("");
  const increment = React.useCallback(() => dispatch({ type: "increment" }), []);
  const reset = React.useCallback(() => dispatch({ type: "reset" }), []);
  const addNote = React.useCallback(() => {
    dispatch({ type: "addNote", text: draft });
    setDraft("");
  }, [draft]);
  return { count: state.count, notes: state.notes, draft, setDraft, increment, reset, addNote };
}

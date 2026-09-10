import React from "/vendor/react.js";
import { actions, initialState, reducer } from "../reducer.js";

export function useDashboard() {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const bound = React.useMemo(() => ({
    increment: () => dispatch(actions.increment()),
    reset: () => dispatch(actions.reset()),
    edit: (draft) => dispatch(actions.edit(draft)),
    commit: () => dispatch(actions.commit()),
  }), []);
  return [state, bound];
}

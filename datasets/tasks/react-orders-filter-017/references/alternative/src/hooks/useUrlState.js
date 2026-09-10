import React from "/vendor/react.js";

export const STATUSES = ["", "pending", "shipped", "delivered"];

export function readUrlState(search) {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  return { q: params.get("q") || "", status: STATUSES.includes(status) ? status : "" };
}

export function serialize(state) {
  return `?q=${encodeURIComponent(state.q)}&status=${state.status}`;
}

function reducer(state, action) {
  switch (action.type) {
    case "query": return { ...state, q: action.value };
    case "status": return { ...state, status: STATUSES.includes(action.value) ? action.value : "" };
    case "restore": return action.value;
    default: return state;
  }
}

export function useUrlState() {
  const [state, dispatch] = React.useReducer(reducer, location.search, readUrlState);
  React.useEffect(() => {
    const next = serialize(state);
    if (location.search !== next) history.pushState(state, "", next);
  }, [state]);
  React.useEffect(() => {
    const onPop = () => dispatch({ type: "restore", value: readUrlState(location.search) });
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return [state, dispatch];
}

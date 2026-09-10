import React from "/vendor/react.js";
import { pageCount, readPage, reducer } from "../pageState.js";

export function usePageState(totalItems, size) {
  const count = pageCount(totalItems, size);
  const [state, dispatch] = React.useReducer(reducer, count, (c) => ({ page: readPage(location.search, c), count: c }));
  React.useEffect(() => {
    const next = `?page=${state.page}`;
    if (location.search !== next) history.pushState({ page: state.page }, "", next);
  }, [state.page]);
  React.useEffect(() => {
    const onPop = () => dispatch({ type: "jump", page: new URLSearchParams(location.search).get("page") });
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  return [state, dispatch];
}

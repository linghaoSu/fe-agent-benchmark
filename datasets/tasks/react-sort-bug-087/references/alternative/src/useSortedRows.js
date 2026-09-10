import React from "/vendor/react.js";
import { reduceSort, sortRows } from "./sortRows.js";

export function useSortedRows(list) {
  const [sort, toggle] = React.useReducer(reduceSort, { key: null, direction: "asc" });
  const rows = React.useMemo(() => sortRows(list, sort), [list, sort]);
  return { sort, toggle, rows };
}

const collator = new Intl.Collator("en", { numeric: true });

export function makeComparator(list, key, direction) {
  const position = new Map(list.map((item, index) => [item, index]));
  const flip = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const left = a[key];
    const right = b[key];
    const primary = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return primary === 0 ? position.get(a) - position.get(b) : flip * primary;
  };
}

export function sortRows(list, { key, direction }) {
  const copy = Array.from(list);
  return key ? copy.sort(makeComparator(list, key, direction)) : copy;
}

export function reduceSort(state, key) {
  return state.key === key
    ? { key, direction: state.direction === "asc" ? "desc" : "asc" }
    : { key, direction: "asc" };
}

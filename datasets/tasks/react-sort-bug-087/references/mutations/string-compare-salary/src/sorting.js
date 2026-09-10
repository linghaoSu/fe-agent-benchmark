export const DIRECTIONS = ["asc", "desc"];

export function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en");
}

export function sortEmployees(list, key, direction = "asc") {
  if (!key) return list.slice();
  const sign = direction === "desc" ? -1 : 1;
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => sign * compareValues(a.item[key], b.item[key]) || a.index - b.index)
    .map(({ item }) => item);
}

export function nextSort(current, key) {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

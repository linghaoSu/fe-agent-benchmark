export function totalPages(count, pageSize) {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function clampPage(page, total) {
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, total);
}

export function parsePage(search, total) {
  return clampPage(new URLSearchParams(search).get("page"), total);
}

export function pageItems(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

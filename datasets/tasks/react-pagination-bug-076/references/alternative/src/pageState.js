export function pageCount(total, size) {
  return total === 0 ? 1 : Math.ceil(total / size);
}

export function readPage(search, count) {
  const raw = Number.parseInt(new URLSearchParams(search).get("page") ?? "1", 10);
  if (Number.isNaN(raw)) return 1;
  return Math.min(Math.max(raw, 1), count);
}

export function reducer(state, action) {
  switch (action.type) {
    case "next": return state.page < state.count ? { ...state, page: state.page + 1 } : state;
    case "prev": return state.page > 1 ? { ...state, page: state.page - 1 } : state;
    case "jump": return { ...state, page: readPage(`?page=${action.page}`, state.count) };
    default: return state;
  }
}

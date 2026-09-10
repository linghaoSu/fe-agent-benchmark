export const initialSearchState = { status: "idle", query: "", results: [] };

// status: idle（未搜索/空查询）| pending（请求中）| done（已完成）
export function searchReducer(state, action) {
  switch (action.type) {
    case "reset": return { ...initialSearchState };
    case "start": return { ...state, status: "pending", query: action.query };
    case "resolve":
      // 只接受与当前查询一致的响应，其它响应视为过期。
      if (action.query !== state.query) return state;
      return { status: "done", query: state.query, results: action.results };
    default: return state;
  }
}

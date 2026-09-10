// 请求序号追踪：只有最后一次发起的请求才算“当前”，用于丢弃过期响应。
export function createRequestTracker() {
  let latest = 0;
  return {
    next() { latest += 1; return latest; },
    isCurrent(id) { return id === latest; },
    get latest() { return latest; },
  };
}

export const DEBOUNCE_MS = 150;

// 计算搜索视图状态：空查询直接显示全部用户；只有当前查询的结果已返回且为空时才显示空状态。
export function deriveView({ query, loading, rows, resolvedQuery, total }) {
  if (!query.trim()) return { rows: total, showEmpty: false, loading: false };
  return { rows, showEmpty: resolvedQuery === query && !loading && rows.length === 0, loading };
}

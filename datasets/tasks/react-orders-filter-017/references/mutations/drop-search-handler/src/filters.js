export const STATUSES = ["", "pending", "shipped", "delivered"];

export function parseFilters(search) {
  const query = new URLSearchParams(search);
  const status = query.get("status") || "";
  return { q: query.get("q") || "", status: STATUSES.includes(status) ? status : "" };
}

export function filterOrders(orders, { q, status }) {
  const needle = q.trim().toLowerCase();
  return orders.filter((order) => (
    (!needle || `${order.id}${order.customer}`.toLowerCase().includes(needle))
    && (!status || order.status === status)
  ));
}

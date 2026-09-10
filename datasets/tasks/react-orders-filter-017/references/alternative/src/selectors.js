export function selectVisible(source, { q, status }) {
  const needle = q.trim().toLowerCase();
  return source.filter((order) => {
    if (status && order.status !== status) return false;
    if (!needle) return true;
    return order.id.toLowerCase().includes(needle) || order.customer.toLowerCase().includes(needle);
  });
}

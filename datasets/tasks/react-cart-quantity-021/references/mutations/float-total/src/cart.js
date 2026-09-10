export const MIN_QTY = 1;
export const MAX_QTY = 99;

export function clampQuantity(quantity) {
  return Math.min(MAX_QTY, Math.max(MIN_QTY, quantity));
}

export function changeQuantity(items, id, delta) {
  return items.map((item) => (item.id === id ? { ...item, quantity: clampQuantity(item.quantity + delta) } : item));
}

export function removeItem(items, id) {
  return items.filter((item) => item.id !== id);
}

// 全部以整数「分」计算，避免浮点误差。
export function totalCents(items) {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function itemCount(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function formatCents(cents) {
  const yuan = Math.trunc(cents / 100);
  const fen = String(Math.abs(cents % 100)).padStart(2, "0");
  const grouped = String(Math.abs(yuan)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}¥${grouped}.${fen}`;
}

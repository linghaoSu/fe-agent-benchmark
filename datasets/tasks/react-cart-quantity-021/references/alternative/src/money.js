const formatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 输入为整数「分」；仅在格式化的最后一步除以 100。
export function formatYuan(cents) {
  return formatter.format(cents / 100);
}

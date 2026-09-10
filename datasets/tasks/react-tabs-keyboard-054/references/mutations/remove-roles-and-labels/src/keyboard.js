export function nextTabIndex(key, current, count) {
  if (count <= 0) return current;
  switch (key) {
    case "ArrowRight": return (current + 1) % count;
    case "ArrowLeft": return (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

export function isActivationKey(key) {
  return key === "Enter" || key === " " || key === "Spacebar";
}

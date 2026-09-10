export const BREAKPOINT = 768;
export const MOBILE_MEDIA = `(max-width: ${BREAKPOINT - 1}px)`;

export function reducer(state, action) {
  switch (action.type) {
    case "viewport": return { mobile: action.mobile, open: action.mobile ? state.open : false };
    case "toggle": return { ...state, open: !state.open };
    default: return state;
  }
}

export function navStyles(mobile) {
  return {
    nav: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "12px 16px", background: "#1e293b", color: "#fff", fontFamily: "system-ui, sans-serif" },
    list: { display: "flex", flexDirection: mobile ? "column" : "row", flexWrap: "wrap", flexBasis: mobile ? "100%" : "auto", gap: "4px", margin: 0, padding: 0 },
    link: { display: "block", padding: "8px 12px", color: "#fff", textDecoration: "none" },
    toggle: { border: "1px solid #94a3b8", background: "transparent", color: "#fff", borderRadius: "6px", padding: "8px 12px", marginLeft: "auto" },
  };
}

export function cardStyles(mobile) {
  return {
    grid: { display: "flex", flexWrap: "wrap", gap: "16px", padding: "0 16px 32px", fontFamily: "system-ui, sans-serif" },
    card: { flex: mobile ? "1 1 100%" : "1 1 0", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", overflowWrap: "anywhere" },
  };
}

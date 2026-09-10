import React from "/vendor/react.js";
import { actionForKey } from "../tabsReducer.js";

export const tabDomId = (id) => `settings-tab-${id}`;
export const panelDomId = (id) => `settings-panel-${id}`;

export function TabList({ tabs, activeId, focusTick, dispatch }) {
  React.useEffect(() => {
    if (focusTick === 0) return;
    const node = document.getElementById(tabDomId(activeId));
    if (node) node.focus();
  }, [activeId, focusTick]);
  const onKeyDown = (event) => {
    const type = actionForKey(event.key);
    if (!type) return;
    const target = event.target.closest("[role=tab]");
    const focusedId = target ? target.getAttribute("data-tab-id") : null;
    event.preventDefault();
    dispatch({ type, focusedId });
  };
  return React.createElement("div", { "data-testid": "tab-strip", role: "tablist", "aria-label": "设置分类", "aria-orientation": "horizontal", onKeyDown, style: { display: "flex", flexWrap: "wrap", gap: "4px", borderBottom: "1px solid #ccc" } },
    tabs.map((tab) => {
      const selected = tab.id === activeId;
      return React.createElement("span", {
        key: tab.id,
        id: tabDomId(tab.id),
        role: "tab",
        "data-testid": "tab",
        "data-tab-id": tab.id,
        "aria-selected": selected ? "true" : "false",
        "aria-controls": panelDomId(tab.id),
        tabIndex: selected ? 0 : -1,
        onClick: () => dispatch({ type: "select", id: tab.id }),
        style: { padding: "8px 12px", cursor: "pointer", userSelect: "none", borderBottom: selected ? "2px solid #1a73e8" : "2px solid transparent" },
      }, tab.label);
    }));
}

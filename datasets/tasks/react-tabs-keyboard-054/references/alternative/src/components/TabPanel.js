import React from "/vendor/react.js";
import { panelDomId, tabDomId } from "./TabList.js";

export function TabPanel({ tab }) {
  return React.createElement("div", { "data-testid": "tab-panel", role: "tabpanel", id: panelDomId(tab.id), "aria-labelledby": tabDomId(tab.id), tabIndex: 0, style: { padding: "12px 0" } },
    React.createElement("p", { style: { margin: 0 } }, tab.panel));
}

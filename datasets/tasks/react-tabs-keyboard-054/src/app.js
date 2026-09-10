import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { tabs } from "./data/tabs.js";

function App() {
  const [active, setActive] = React.useState(0);
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "设置"),
    React.createElement("div", { "data-testid": "tab-strip", style: { display: "flex", flexWrap: "wrap", gap: "4px", borderBottom: "1px solid #ccc" } },
      tabs.map((tab, index) => React.createElement("div", {
        key: tab.id,
        "data-testid": "tab",
        "data-active": index === active ? "true" : "false",
        onClick: () => setActive(index),
        style: { padding: "8px 12px", cursor: "pointer", borderBottom: index === active ? "2px solid #1a73e8" : "2px solid transparent" },
      }, tab.label))),
    React.createElement("div", { "data-testid": "tab-panel", style: { padding: "12px 0" } }, tabs[active].panel));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

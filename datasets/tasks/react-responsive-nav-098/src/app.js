import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cards, navLinks } from "./data/nav.js";

const navStyle = { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "16px", padding: "12px 16px", background: "#0f172a", color: "#fff" };
const linkStyle = { minWidth: "160px", display: "block", padding: "8px 12px", color: "#fff", textDecoration: "none" };
const gridStyle = { display: "flex", gap: "16px", padding: "0 16px 32px" };
const cardStyle = { width: "420px", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" };

function App() {
  return React.createElement(React.Fragment, null,
    React.createElement("nav", { "data-testid": "nav", "aria-label": "主导航", style: navStyle },
      React.createElement("span", { style: { fontWeight: 700, fontSize: "18px" } }, "云帆"),
      React.createElement("ul", { "data-testid": "nav-list", style: { display: "flex", flexWrap: "nowrap", listStyle: "none", margin: 0, padding: 0 } },
        navLinks.map((link) => React.createElement("li", { key: link.id }, React.createElement("a", { "data-testid": "nav-link", href: link.href, style: linkStyle }, link.label))))),
    React.createElement("section", { style: { padding: "32px 16px" } },
      React.createElement("h1", { style: { margin: "0 0 8px" } }, "构建更快的前端"),
      React.createElement("p", { style: { margin: 0, color: "#475569" } }, "一个面向团队的现代化部署平台。")),
    React.createElement("section", { style: gridStyle },
      cards.map((card) => React.createElement("article", { key: card.id, "data-testid": "card", style: cardStyle },
        React.createElement("h2", { style: { margin: "0 0 8px", fontSize: "18px" } }, card.title),
        React.createElement("p", { style: { margin: 0 } }, card.body)))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

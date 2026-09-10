import React from "/vendor/react.js";
import { navStyles } from "../layout.js";

export function Nav({ links, mobile, open, onToggle }) {
  const s = navStyles(mobile);
  const showList = !mobile || open;
  return React.createElement("header", { style: { margin: 0 } },
    React.createElement("nav", { "data-testid": "nav", "aria-label": "站点导航", style: s.nav },
      React.createElement("strong", { style: { fontSize: "18px" } }, "云帆"),
      mobile
        ? React.createElement("button", { type: "button", "data-testid": "nav-toggle", "aria-expanded": open, "aria-controls": "site-links", style: s.toggle, onClick: onToggle }, open ? "关闭菜单" : "打开菜单")
        : null,
      React.createElement("div", { id: "site-links", role: "list", "data-testid": "nav-list", style: { ...s.list, display: showList ? "flex" : "none" } },
        links.map((link) => React.createElement("a", { key: link.id, role: "listitem", "data-testid": "nav-link", href: link.href, style: s.link }, link.label)))));
}

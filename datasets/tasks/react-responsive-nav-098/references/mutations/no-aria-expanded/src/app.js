import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cards, navLinks } from "./data/nav.js";
import { MOBILE_QUERY, navListVisible, styles, toggleLabel } from "./responsive.js";

function useMobile() {
  const [mobile, setMobile] = React.useState(() => window.matchMedia(MOBILE_QUERY).matches);
  React.useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}

function App() {
  const mobile = useMobile();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (!mobile) setOpen(false); }, [mobile]);
  const visible = navListVisible({ mobile, open });
  return React.createElement(React.Fragment, null,
    React.createElement("style", null, styles()),
    React.createElement("nav", { "data-testid": "nav", "aria-label": "主导航", className: "nav" },
      React.createElement("span", { className: "brand" }, "云帆"),
      mobile ? React.createElement("button", { type: "button", "data-testid": "nav-toggle", className: "nav-toggle", "aria-label": toggleLabel(open), "aria-controls": "primary-nav-list", onClick: () => setOpen((current) => !current) }, "菜单") : null,
      React.createElement("ul", { id: "primary-nav-list", "data-testid": "nav-list", className: "nav-list", hidden: !visible },
        navLinks.map((link) => React.createElement("li", { key: link.id }, React.createElement("a", { "data-testid": "nav-link", href: link.href }, link.label))))),
    React.createElement("section", { className: "hero" },
      React.createElement("h1", null, "构建更快的前端"),
      React.createElement("p", null, "一个面向团队的现代化部署平台。")),
    React.createElement("section", { className: "grid" },
      cards.map((card) => React.createElement("article", { key: card.id, "data-testid": "card", className: "card" },
        React.createElement("h2", null, card.title),
        React.createElement("p", null, card.body)))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

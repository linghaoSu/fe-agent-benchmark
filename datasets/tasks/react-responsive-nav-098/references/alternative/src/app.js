import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { cards, navLinks } from "./data/nav.js";
import { MOBILE_MEDIA, reducer } from "./layout.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { Nav } from "./components/Nav.js";
import { Cards } from "./components/Cards.js";

document.body.style.margin = "0";
document.documentElement.style.boxSizing = "border-box";

function App() {
  const [state, dispatch] = React.useReducer(reducer, { mobile: window.matchMedia(MOBILE_MEDIA).matches, open: false });
  useMediaQuery(MOBILE_MEDIA, (mobile) => dispatch({ type: "viewport", mobile }));
  return React.createElement(React.Fragment, null,
    React.createElement(Nav, { links: navLinks, mobile: state.mobile, open: state.open, onToggle: () => dispatch({ type: "toggle" }) }),
    React.createElement("main", { style: { padding: "32px 16px", fontFamily: "system-ui, sans-serif" } },
      React.createElement("h1", { style: { margin: "0 0 8px" } }, "构建更快的前端"),
      React.createElement("p", { style: { margin: 0, color: "#475569" } }, "一个面向团队的现代化部署平台。")),
    React.createElement(Cards, { items: cards, mobile: state.mobile }));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { useDashboard } from "./hooks/useDashboard.js";

function App() {
  const { count, notes, draft, setDraft, increment, reset, addNote } = useDashboard();
  return React.createElement("section", { style: { maxWidth: 360, padding: 16 } },
    React.createElement("h1", null, "仪表盘"),
    React.createElement("p", null, "计数：", React.createElement("strong", { "data-testid": "count" }, count)),
    React.createElement("button", { type: "button", "data-testid": "increment", onClick: increment }, React.createElement("span", { "aria-hidden": "true" }, "+")),
    " ",
    React.createElement("button", { type: "button", "data-testid": "reset", onClick: reset }, React.createElement("span", { "aria-hidden": "true" }, "↺")),
    React.createElement("h2", null, "笔记（", React.createElement("span", { "data-testid": "note-count" }, notes.length), "）"),
    React.createElement("textarea", { "data-testid": "note-input", rows: 3, style: { width: "100%", boxSizing: "border-box" }, value: draft, onChange: (event) => setDraft(event.target.value) }),
    React.createElement("button", { type: "button", "data-testid": "add-note", onClick: addNote }, "添加笔记"),
    React.createElement("ul", null, notes.map((note, index) => React.createElement("li", { key: index, "data-testid": "note-item" }, note))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

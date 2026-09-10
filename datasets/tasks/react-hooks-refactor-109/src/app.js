import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { store } from "./store.js";

function App() {
  const [, forceUpdate] = React.useReducer((tick) => tick + 1, 0);
  React.useEffect(() => store.subscribe(forceUpdate), []);
  const [draft, setDraft] = React.useState("");
  const { count, notes } = store.getState();
  const addNote = () => { const text = draft.trim(); if (text) store.dispatch({ type: "addNote", text }); setDraft(""); };
  return React.createElement("section", { style: { maxWidth: 360, padding: 16 } },
    React.createElement("h1", null, "仪表盘"),
    React.createElement("p", null, "计数：", React.createElement("strong", { "data-testid": "count" }, count)),
    React.createElement("button", { type: "button", "data-testid": "increment", onClick: () => store.dispatch({ type: "increment" }) }, "加一"),
    " ",
    React.createElement("button", { type: "button", "data-testid": "reset", onClick: () => store.dispatch({ type: "reset" }) }, "重置"),
    React.createElement("h2", null, "笔记（", React.createElement("span", { "data-testid": "note-count" }, notes.length), "）"),
    React.createElement("textarea", { "data-testid": "note-input", "aria-label": "新笔记内容", rows: 3, style: { width: "100%", boxSizing: "border-box" }, value: draft, onChange: (event) => setDraft(event.target.value) }),
    React.createElement("button", { type: "button", "data-testid": "add-note", onClick: addNote }, "添加笔记"),
    React.createElement("ul", null, notes.map((note, index) => React.createElement("li", { key: index, "data-testid": "note-item" }, note))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

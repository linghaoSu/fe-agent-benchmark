import React from "/vendor/react.js";

export function Notes({ notes, draft, onEdit, onCommit }) {
  const submit = (event) => { event.preventDefault(); onCommit(); };
  return React.createElement("form", { onSubmit: submit, "aria-labelledby": "notes-heading" },
    React.createElement("h2", { id: "notes-heading" }, "笔记"),
    React.createElement("p", null, "共 ", React.createElement("span", { "data-testid": "note-count" }, notes.length), " 条"),
    React.createElement("label", { htmlFor: "note-input" }, "新笔记内容"),
    React.createElement("textarea", { id: "note-input", "data-testid": "note-input", rows: 2, style: { display: "block", width: "100%", boxSizing: "border-box" }, value: draft, onChange: (event) => onEdit(event.target.value) }),
    React.createElement("button", { type: "submit", "data-testid": "add-note" }, "添加笔记"),
    React.createElement("ol", null, notes.map((note) => React.createElement("li", { key: note.id, "data-testid": "note-item" }, note.text))));
}

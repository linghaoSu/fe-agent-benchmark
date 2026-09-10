import React from "/vendor/react.js";

function TodoItem({ todo, onToggle }) {
  const inputId = `todo-${todo.id}`;
  return React.createElement("li", { "data-testid": "todo-row", "data-completed": String(todo.completed), style: { display: "flex", gap: "8px", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" } },
    React.createElement("input", { id: inputId, type: "checkbox", "data-testid": "todo-toggle", checked: todo.completed, onChange: () => onToggle(todo.id) }),
    React.createElement("label", { htmlFor: inputId, style: todo.completed ? { textDecoration: "line-through", opacity: 0.7 } : undefined }, todo.title));
}

export function TodoList({ todos, onToggle }) {
  if (!todos.length) return React.createElement("p", { role: "status" }, "没有待办");
  return React.createElement("ul", { "aria-label": "待办列表", style: { listStyle: "none", padding: 0, margin: "12px 0", maxWidth: "100%" } },
    todos.map((todo) => React.createElement(TodoItem, { key: todo.id, todo, onToggle })));
}

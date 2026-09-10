import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { todos as initialTodos } from "./data/todos.js";
import { filterTodos, remainingCount, toggleTodo } from "./todos-logic.js";

const FILTER_LABELS = [["all", "全部"], ["active", "未完成"], ["completed", "已完成"]];

function App() {
  const [todos, setTodos] = React.useState(initialTodos);
  const [filter, setFilter] = React.useState("all");
  const visible = filterTodos(todos, filter);
  const toggle = (id) => () => setTodos((current) => toggleTodo(current, id));
  return React.createElement("section", null,
    React.createElement("h1", null, "待办事项"),
    React.createElement("select", { "data-testid": "todo-filter", "aria-label": "筛选待办", value: filter, onChange: (event) => setFilter(event.target.value) },
      FILTER_LABELS.map(([value, label]) => React.createElement("option", { key: value, value }, label))),
    React.createElement("p", { "data-testid": "remaining-count" }, `剩余 ${remainingCount(todos)} 项`),
    React.createElement("table", null, React.createElement("tbody", null, visible.map((todo) => React.createElement("tr", { key: todo.id, "data-testid": "todo-row", "data-completed": todo.completed ? "true" : "false" },
      React.createElement("td", null, React.createElement("input", { type: "checkbox", "data-testid": "todo-toggle", "aria-label": `完成 ${todo.title}`, checked: todo.completed, onChange: toggle(todo.id) })),
      React.createElement("td", { style: todo.completed ? { textDecoration: "line-through", color: "#666" } : null }, todo.title))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

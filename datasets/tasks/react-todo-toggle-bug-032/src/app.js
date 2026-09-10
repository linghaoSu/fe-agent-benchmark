import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { todos } from "./data/todos.js";

const FILTERS = [["all", "全部"], ["active", "未完成"], ["completed", "已完成"]];

function visibleTodos(filter) {
  if (filter === "active") return todos.filter((todo) => !todo.completed);
  if (filter === "completed") return todos.filter((todo) => todo.completed);
  return todos;
}

function App() {
  const [filter, setFilter] = React.useState("all");
  const [, setVersion] = React.useState(0);
  const visible = visibleTodos(filter);
  const remaining = todos.filter((todo) => todo.completed).length;
  const toggle = (index) => () => {
    todos[index].completed = !todos[index].completed;
    setVersion((version) => version + 1);
  };
  return React.createElement("section", null,
    React.createElement("h1", null, "待办事项"),
    React.createElement("select", { "data-testid": "todo-filter", "aria-label": "筛选待办", value: filter, onChange: (event) => setFilter(event.target.value) },
      FILTERS.map(([value, label]) => React.createElement("option", { key: value, value }, label))),
    React.createElement("p", { "data-testid": "remaining-count" }, `剩余 ${remaining} 项`),
    React.createElement("table", null, React.createElement("tbody", null, visible.map((todo, index) => React.createElement("tr", { key: todo.id, "data-testid": "todo-row" },
      React.createElement("td", null, React.createElement("input", { type: "checkbox", "data-testid": "todo-toggle", "aria-label": `完成 ${todo.title}`, defaultChecked: todo.completed, onChange: toggle(index) })),
      React.createElement("td", null, todo.title))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

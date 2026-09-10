import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { todos } from "./data/todos.js";
import { initialState, reducer, selectRemaining, selectVisible } from "./store.js";
import { FilterBar } from "./components/FilterBar.js";
import { TodoList } from "./components/TodoList.js";

function App() {
  const [state, dispatch] = React.useReducer(reducer, todos, initialState);
  const visible = React.useMemo(() => selectVisible(state), [state]);
  const remaining = React.useMemo(() => selectRemaining(state), [state]);
  const onToggle = React.useCallback((id) => dispatch({ type: "toggle", id }), []);
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "待办事项"),
    React.createElement(FilterBar, { filter: state.filter, remaining, dispatch }),
    React.createElement(TodoList, { todos: visible, onToggle }));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

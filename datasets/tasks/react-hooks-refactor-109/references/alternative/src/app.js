import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { useDashboard } from "./hooks/useDashboard.js";
import { Counter } from "./components/Counter.js";
import { Notes } from "./components/Notes.js";

function App() {
  const [state, dispatch] = useDashboard();
  return React.createElement("section", { style: { display: "grid", gap: 16, padding: 12 } },
    React.createElement("h1", null, "仪表盘"),
    React.createElement(Counter, { count: state.count, onIncrement: dispatch.increment, onReset: dispatch.reset }),
    React.createElement(Notes, { notes: state.notes, draft: state.draft, onEdit: dispatch.edit, onCommit: dispatch.commit }));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

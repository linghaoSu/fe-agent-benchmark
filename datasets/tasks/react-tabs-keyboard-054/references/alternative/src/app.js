import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { tabs } from "./data/tabs.js";
import { initialState, tabsReducer } from "./tabsReducer.js";
import { TabList } from "./components/TabList.js";
import { TabPanel } from "./components/TabPanel.js";

const ids = tabs.map((tab) => tab.id);

function App() {
  const [state, dispatch] = React.useReducer((s, a) => tabsReducer(ids, s, a), ids, initialState);
  const activeTab = tabs.find((tab) => tab.id === state.activeId) || tabs[0];
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "设置"),
    React.createElement(TabList, { tabs, activeId: state.activeId, focusTick: state.focusTick, dispatch }),
    React.createElement(TabPanel, { tab: activeTab }));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

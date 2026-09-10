import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { users } from "./data/users.js";
import { searchUsers } from "./api/searchUsers.js";
import { DEBOUNCE_MS, createRequestTracker, deriveView } from "./requestTracker.js";

const roleLabels = { admin: "管理员", editor: "编辑", viewer: "访客" };
const tracker = createRequestTracker();

function App() {
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState({ query: "", rows: [] });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!query.trim()) { setLoading(false); return undefined; }
    const timer = setTimeout(() => {
      const id = tracker.next();
      setLoading(true);
      searchUsers(query).then((rows) => {
        if (!tracker.isCurrent(id)) return;
        setResult({ query, rows });
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const view = deriveView({ query, loading, rows: result.rows, resolvedQuery: result.query, total: users });
  return React.createElement("section", null,
    React.createElement("h1", null, "用户搜索"),
    React.createElement("input", { "data-testid": "search-input", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "输入姓名或邮箱" }),
    view.loading ? React.createElement("p", { "data-testid": "loading-state", role: "status" }, "搜索中…") : null,
    React.createElement("p", { "data-testid": "result-count" }, `共 ${view.rows.length} 位用户`),
    view.showEmpty
      ? React.createElement("p", { "data-testid": "empty-state" }, "没有匹配的用户")
      : React.createElement("table", { style: { width: "100%", tableLayout: "fixed", overflowWrap: "anywhere" } },
        React.createElement("tbody", null, view.rows.map((user) => React.createElement("tr", { key: user.id, "data-testid": "user-row" }, React.createElement("td", null, user.name), React.createElement("td", null, user.email), React.createElement("td", null, roleLabels[user.role]))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

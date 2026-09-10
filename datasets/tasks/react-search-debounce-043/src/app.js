import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { users } from "./data/users.js";
import { searchUsers } from "./api/searchUsers.js";

const roleLabels = { admin: "管理员", editor: "编辑", viewer: "访客" };
function App() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState(users);
  const onChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    searchUsers(value).then((rows) => setResults(rows));
  };
  return React.createElement("section", null,
    React.createElement("h1", null, "用户搜索"),
    React.createElement("input", { "data-testid": "search-input", "aria-label": "搜索用户", value: query, onChange, placeholder: "输入姓名或邮箱" }),
    React.createElement("p", { "data-testid": "result-count" }, `共 ${results.length} 位用户`),
    React.createElement("table", { style: { width: "100%", tableLayout: "fixed", overflowWrap: "anywhere" } },
      React.createElement("tbody", null, results.map((user) => React.createElement("tr", { key: user.id, "data-testid": "user-row" }, React.createElement("td", null, user.name), React.createElement("td", null, user.email), React.createElement("td", null, roleLabels[user.role]))))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { users } from "./data/users.js";
import { searchUsers } from "./api/searchUsers.js";
import { useDebouncedValue } from "./hooks/useDebouncedValue.js";
import { initialSearchState, searchReducer } from "./searchState.js";
import { SearchBox } from "./components/SearchBox.js";
import { UserList } from "./components/UserList.js";

function App() {
  const [input, setInput] = React.useState("");
  const query = useDebouncedValue(input, 150);
  const [search, dispatch] = React.useReducer(searchReducer, initialSearchState);

  React.useEffect(() => {
    if (!query.trim()) { dispatch({ type: "reset" }); return undefined; }
    const controller = new AbortController();
    dispatch({ type: "start", query });
    searchUsers(query, { signal: controller.signal })
      .then((results) => dispatch({ type: "resolve", query, results }))
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  const idle = search.status === "idle";
  return React.createElement("main", { style: { padding: "0 8px", maxWidth: "100%", boxSizing: "border-box" } },
    React.createElement("h1", null, "用户搜索"),
    React.createElement(SearchBox, { value: input, onChange: setInput }),
    React.createElement(UserList, { users: idle ? users : search.results, pending: search.status === "pending", searched: search.status === "done" }));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

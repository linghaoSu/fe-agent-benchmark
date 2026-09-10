import React from "/vendor/react.js";

const roleLabels = { admin: "管理员", editor: "编辑", viewer: "访客" };

export function UserList({ users, pending, searched }) {
  return React.createElement(React.Fragment, null,
    pending ? React.createElement("div", { "data-testid": "loading-state", role: "status", "aria-live": "polite" }, "正在搜索…") : null,
    React.createElement("div", { "data-testid": "result-count", "aria-live": "polite" }, `${users.length} 个结果`),
    searched && !pending && users.length === 0
      ? React.createElement("div", { "data-testid": "empty-state", role: "status" }, "未找到匹配的用户")
      : React.createElement("ul", { "aria-label": "用户列表", style: { listStyle: "none", padding: 0, margin: 0 } },
        users.map((user) => React.createElement("li", { key: user.id, "data-testid": "user-row", style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "6px 0", borderBottom: "1px solid #ddd", overflowWrap: "anywhere" } },
          React.createElement("strong", null, user.name),
          React.createElement("span", null, user.email),
          React.createElement("span", null, roleLabels[user.role])))));
}

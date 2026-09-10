import React from "/vendor/react.js";

export function Counter({ count, onIncrement, onReset }) {
  return React.createElement("fieldset", null,
    React.createElement("legend", null, "计数器"),
    React.createElement("output", { "data-testid": "count", "aria-label": "当前计数" }, count),
    React.createElement("div", null,
      React.createElement("button", { type: "button", "data-testid": "increment", onClick: onIncrement }, "加一"),
      React.createElement("button", { type: "button", "data-testid": "reset", onClick: onReset }, "重置")));
}

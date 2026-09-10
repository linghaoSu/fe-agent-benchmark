import React from "/vendor/react.js";
import { formatYuan } from "../money.js";

const cellStyle = { padding: "8px 4px", verticalAlign: "middle" };
const iconButton = { minWidth: "32px", minHeight: "32px" };

export function CartRow({ item, dispatch }) {
  const act = (type) => () => dispatch({ type, id: item.id });
  return React.createElement("tr", { "data-testid": "cart-row" },
    React.createElement("th", { scope: "row", style: { ...cellStyle, textAlign: "left", fontWeight: "normal", overflowWrap: "anywhere" } },
      React.createElement("div", null, item.name),
      React.createElement("small", null, `单价 ${formatYuan(item.unitPrice)}`)),
    React.createElement("td", { style: { ...cellStyle, whiteSpace: "nowrap", textAlign: "center" } },
      React.createElement("button", { type: "button", "data-testid": "qty-decrement", title: `减少 ${item.name} 数量`, style: iconButton, onClick: act("decrement") }, "−"),
      React.createElement("output", { "data-testid": "qty-value", style: { display: "inline-block", minWidth: "2.5ch", textAlign: "center" } }, item.quantity),
      React.createElement("button", { type: "button", "data-testid": "qty-increment", title: `增加 ${item.name} 数量`, style: iconButton, onClick: act("increment") }, "+")),
    React.createElement("td", { style: { ...cellStyle, textAlign: "center" } },
      React.createElement("button", { type: "button", "data-testid": "remove-item", "aria-label": `删除 ${item.name}`, style: iconButton, onClick: act("remove") }, "删除")));
}

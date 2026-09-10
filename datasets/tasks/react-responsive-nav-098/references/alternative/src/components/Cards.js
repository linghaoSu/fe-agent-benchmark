import React from "/vendor/react.js";
import { cardStyles } from "../layout.js";

export function Cards({ items, mobile }) {
  const s = cardStyles(mobile);
  return React.createElement("section", { style: s.grid },
    items.map((card) => React.createElement("article", { key: card.id, "data-testid": "card", style: s.card },
      React.createElement("h2", { style: { margin: "0 0 8px", fontSize: "18px" } }, card.title),
      React.createElement("p", { style: { margin: 0 } }, card.body))));
}

import React from "/vendor/react.js";

export function ProductList({ items }) {
  return React.createElement("ul", { "aria-label": "商品列表", style: { listStyle: "none", padding: 0, margin: 0, maxWidth: "100%" } },
    items.map((product) => React.createElement("li", { key: product.id, "data-testid": "product-row", style: { display: "flex", flexWrap: "wrap", gap: "12px", padding: "8px 0", borderBottom: "1px solid #ddd", overflowWrap: "anywhere" } },
      React.createElement("span", null, product.id),
      React.createElement("strong", null, product.name),
      React.createElement("span", null, product.category),
      React.createElement("span", null, `¥${product.price}`))));
}

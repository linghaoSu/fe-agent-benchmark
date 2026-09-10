import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { products, PAGE_SIZE } from "./data/products.js";

function App() {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.floor(products.length / PAGE_SIZE);
  React.useEffect(() => { history.replaceState(null, "", `?page=${page}`); }, [page]);
  React.useEffect(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get("page"));
    if (fromUrl && fromUrl !== page) setPage(fromUrl);
  }, []);
  const rows = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return React.createElement("section", null,
    React.createElement("h1", null, "商品列表"),
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
      React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "编号"), React.createElement("th", null, "名称"), React.createElement("th", null, "分类"), React.createElement("th", null, "价格"))),
      React.createElement("tbody", null, rows.map((product) => React.createElement("tr", { key: product.id, "data-testid": "product-row" },
        React.createElement("td", null, product.id), React.createElement("td", null, product.name), React.createElement("td", null, product.category), React.createElement("td", null, `¥${product.price}`))))),
    React.createElement("nav", { "aria-label": "分页", style: { display: "flex", gap: "12px", alignItems: "center", marginTop: "12px" } },
      React.createElement("button", { type: "button", "data-testid": "prev-page", "aria-label": "上一页", onClick: () => setPage(page - 1) }, React.createElement("span", { "aria-hidden": "true" }, "‹")),
      React.createElement("span", { "data-testid": "page-indicator" }, `第 ${page} / ${totalPages} 页`),
      React.createElement("button", { type: "button", "data-testid": "next-page", "aria-label": "下一页", onClick: () => setPage(page + 1) }, React.createElement("span", { "aria-hidden": "true" }, "›"))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

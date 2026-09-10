import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { products, PAGE_SIZE } from "./data/products.js";
import { pageItems, parsePage, totalPages } from "./pagination.js";

const total = totalPages(products.length, PAGE_SIZE);
function initialPage() { return parsePage(location.search, total); }

function App() {
  const [page, setPage] = React.useState(initialPage);
  React.useEffect(() => { history.replaceState(null, "", `?page=${page}`); }, [page]);
  const canPrev = page >= 1;
  const canNext = page < total;
  const rows = pageItems(products, page, PAGE_SIZE);
  return React.createElement("section", null,
    React.createElement("h1", null, "商品列表"),
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
      React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "编号"), React.createElement("th", null, "名称"), React.createElement("th", null, "分类"), React.createElement("th", null, "价格"))),
      React.createElement("tbody", null, rows.map((product) => React.createElement("tr", { key: product.id, "data-testid": "product-row" },
        React.createElement("td", null, product.id), React.createElement("td", null, product.name), React.createElement("td", null, product.category), React.createElement("td", null, `¥${product.price}`))))),
    React.createElement("nav", { "aria-label": "分页", style: { display: "flex", gap: "12px", alignItems: "center", marginTop: "12px" } },
      React.createElement("button", { type: "button", "data-testid": "prev-page", "aria-label": "上一页", disabled: !canPrev, onClick: () => canPrev && setPage(page - 1) }, React.createElement("span", { "aria-hidden": "true" }, "‹")),
      React.createElement("span", { "data-testid": "page-indicator", "aria-live": "polite" }, `第 ${page} / ${total} 页`),
      React.createElement("button", { type: "button", "data-testid": "next-page", "aria-label": "下一页", disabled: !canNext, onClick: () => canNext && setPage(page + 1) }, React.createElement("span", { "aria-hidden": "true" }, "›"))));
}
createRoot(document.getElementById("root")).render(React.createElement(App));

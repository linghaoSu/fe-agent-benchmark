import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { products, PAGE_SIZE } from "./data/products.js";
import { usePageState } from "./hooks/usePageState.js";
import { Pager } from "./components/Pager.js";
import { ProductList } from "./components/ProductList.js";

function App() {
  const [{ page, count }, dispatch] = usePageState(products.length, PAGE_SIZE);
  const items = React.useMemo(() => products.filter((_, index) => Math.floor(index / PAGE_SIZE) === page - 1), [page]);
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "商品列表"),
    React.createElement(ProductList, { items }),
    React.createElement(Pager, { page, count, dispatch }));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

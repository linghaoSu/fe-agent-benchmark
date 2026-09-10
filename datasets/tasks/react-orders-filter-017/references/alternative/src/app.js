import React from "/vendor/react.js";
import { createRoot } from "/vendor/react-dom-client.js";
import { orders } from "./data/orders.js";
import { useUrlState } from "./hooks/useUrlState.js";
import { Filters } from "./components/Filters.js";
import { OrdersTable } from "./components/OrdersTable.js";
import { selectVisible } from "./selectors.js";

function useOrders() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve(orders).then((rows) => { if (!cancelled) setData(rows); });
    return () => { cancelled = true; };
  }, []);
  return data;
}

function App() {
  const [state, dispatch] = useUrlState();
  const data = useOrders();
  const visible = React.useMemo(() => selectVisible(data || [], state), [data, state]);
  return React.createElement("section", { style: { maxWidth: "100%", padding: "0 8px", boxSizing: "border-box" } },
    React.createElement("h1", null, "订单列表"),
    React.createElement(Filters, { state, dispatch }),
    data === null
      ? React.createElement("p", { "data-testid": "loading-state", role: "status", "aria-live": "polite" }, "加载中…")
      : React.createElement(OrdersTable, { orders: visible }));
}

createRoot(document.getElementById("root")).render(React.createElement(App));

export const LIMITS = { min: 1, max: 99 };

export function toState(items) {
  return { order: items.map((item) => item.id), byId: Object.fromEntries(items.map((item) => [item.id, { ...item }])) };
}

export function cartReducer(state, action) {
  switch (action.type) {
    case "increment":
    case "decrement": {
      const item = state.byId[action.id];
      if (!item) return state;
      const next = item.quantity + (action.type === "increment" ? 1 : -1);
      if (next < LIMITS.min || next > LIMITS.max) return state;
      return { ...state, byId: { ...state.byId, [action.id]: { ...item, quantity: next } } };
    }
    case "remove": {
      const { [action.id]: _removed, ...byId } = state.byId;
      return { order: state.order.filter((id) => id !== action.id), byId };
    }
    default:
      return state;
  }
}

export function selectItems(state) {
  return state.order.map((id) => state.byId[id]);
}

export function selectSummary(state) {
  let cents = 0;
  let count = 0;
  for (const id of state.order) {
    const item = state.byId[id];
    cents += item.unitPrice * item.quantity;
    count += item.quantity;
  }
  return { cents, count };
}

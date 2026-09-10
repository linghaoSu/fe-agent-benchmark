const KEY_ACTIONS = { ArrowRight: "next", ArrowLeft: "prev", Home: "first", End: "last", Enter: "activate", " ": "activate", Spacebar: "activate" };

export function actionForKey(key) {
  return KEY_ACTIONS[key] || null;
}

export function initialState(ids) {
  return { activeId: ids[0], focusTick: 0 };
}

export function tabsReducer(ids, state, action) {
  const index = ids.indexOf(state.activeId);
  const focused = ids.indexOf(action.focusedId);
  const base = focused >= 0 ? focused : index;
  const at = (i) => ({ activeId: ids[i], focusTick: state.focusTick + 1 });
  switch (action.type) {
    case "select": return ids.includes(action.id) ? { ...state, activeId: action.id } : state;
    case "next": return at((base + 1) % ids.length);
    case "prev": return at((base - 1 + ids.length) % ids.length);
    case "first": return at(0);
    case "last": return at(ids.length - 1);
    case "activate": return focused >= 0 ? at(focused) : state;
    default: return state;
  }
}

export const initialState = (todos) => ({ filter: "all", byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])), order: todos.map((todo) => todo.id) });

export function reducer(state, action) {
  switch (action.type) {
    case "toggle": {
      const todo = state.byId[action.id];
      if (!todo) return state;
      return { ...state, byId: { ...state.byId, [action.id]: { ...todo, completed: !todo.completed } } };
    }
    case "filter":
      return ["all", "active", "completed"].includes(action.filter) ? { ...state, filter: action.filter } : state;
    default:
      return state;
  }
}

export const selectAll = (state) => state.order.map((id) => state.byId[id]);
export const selectRemaining = (state) => selectAll(state).filter((todo) => !todo.completed).length;
export const selectVisible = (state) => {
  const all = selectAll(state);
  if (state.filter === "active") return all.filter((todo) => !todo.completed);
  if (state.filter === "completed") return all.filter((todo) => todo.completed);
  return all;
};

export const initialState = { count: 0, draft: "", notes: [] };

export const actions = {
  increment: () => ({ type: "counter/increment" }),
  reset: () => ({ type: "counter/reset" }),
  edit: (draft) => ({ type: "notes/edit", draft }),
  commit: () => ({ type: "notes/commit" }),
};

const handlers = {
  "counter/increment": (state) => ({ ...state, count: state.count + 1 }),
  "counter/reset": (state) => ({ ...state, count: 0 }),
  "notes/edit": (state, action) => ({ ...state, draft: action.draft }),
  "notes/commit": (state) => {
    const text = state.draft.trim();
    return text ? { ...state, draft: "", notes: [...state.notes, { id: state.notes.length + 1, text }] } : state;
  },
};

export function reducer(state, action) {
  const handler = handlers[action.type];
  return handler ? handler(state, action) : state;
}

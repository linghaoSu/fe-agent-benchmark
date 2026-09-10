export const initialState = { count: 0, notes: [] };

export function reducer(state, action) {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + 1 };
    case "reset":
      return { ...state, count: 0 };
    case "addNote": {
      // The reducer owns the "no empty notes" rule so every caller gets it for free.
      const text = typeof action.text === "string" ? action.text.trim() : "";
      return text ? { ...state, notes: [...state.notes, text] } : state;
    }
    default:
      return state;
  }
}

export const initialState = { count: 0, notes: [] };

export function reducer(state, action) {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + 1 };
    case "reset":
      return { ...state, count: 0 };
    case "addNote":
      return { ...state, notes: [...state.notes, action.text] };
    default:
      return state;
  }
}

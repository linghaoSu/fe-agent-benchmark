import { initialState, reducer } from "./reducer.js";

let state = initialState;
const listeners = new Set();

export const store = {
  getState() { return state; },
  setState(next) { state = next; listeners.forEach((listener) => listener()); },
  dispatch(action) { store.setState(reducer(state, action)); },
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};

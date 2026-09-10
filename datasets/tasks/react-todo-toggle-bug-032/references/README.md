# references/ — host-only reference material for `react-todo-toggle-bug-032`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/todos.js` (6 todos: t1..t6, t2 and t5 completed).

## The starter's bugs (what the Agent must fix)

1. `toggle(index)` mutates the shared `todos` array in place and indexes it with
   the row's position in the *visible* list, so under the `active` filter the
   wrong todo flips.
2. `remaining` counts `completed` todos instead of incomplete ones.
3. Rows never get `data-completed`; checkboxes use `defaultChecked`, so their
   state desyncs from data and is lost when the filter changes.

## gold/

Single `src/app.js` plus a pure `src/todos-logic.js` (`toggleTodo(todos, id)`,
`filterTodos`, `remainingCount`). Todos live in `React.useState`, toggling is
by id and immutable, `remaining-count` shows incomplete items, `<table>` rows
carry `data-completed="true"|"false"` and controlled `checked` checkboxes,
every control has an `aria-label`. `tests/todos-logic.test.mjs` unit-tests the
pure module. Passes all five hidden tests.

## alternative/

Structurally different but behaviourally equivalent:

- `src/store.js`: `useReducer` over a normalized `{ byId, order, filter }`
  state with `toggle`/`filter` actions and derived selectors
  (`selectVisible`, `selectRemaining`);
- `src/components/FilterBar.js`: a `<form>` with a real `<label htmlFor>`
  wrapping the `<select id="todo-filter">` (no `aria-label`) and an `<output
  data-testid="remaining-count">` counter rendered as separate text children
  (`"剩余 ", n, " 项"`, so tests must normalise whitespace);
- `src/components/TodoList.js`: `<ul>/<li data-testid="todo-row">` items whose
  checkbox is labelled via `<label htmlFor>` on the title.
- `tests/store.test.mjs` unit-tests the reducer and selectors.

## mutations/

Each is a copy of gold's `src/` + `tests/` with exactly one defect.

| mutation | defect | hidden tests tripped | expected |
| --- | --- | --- | --- |
| `toggle-by-visible-index` | checkbox handler passes the visible-row index and toggles `current[index].id` from the full array | `toggle-by-id-under-active-filter` (critical): under `active`, clicking the 2nd row (t3) flips t2 instead, 4 rows remain | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `inverted-remaining-count` | renders `todos.length - remainingCount(todos)` (completed count) | `remaining-count-after-toggles` (critical, expects 4/3/2, sees 2/3/4), `toggle-twice-restores` (non-critical); `toggle-by-id-under-active-filter` passes coincidentally (3 completed = 3 remaining after one toggle) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `stale-completed-attr` | `data-completed` derived from the initial dataset, never from state | `completed-filter-reflects-toggles` (critical: newly completed row reports `data-completed="false"`), `toggle-by-id-under-active-filter` (critical), `toggle-twice-restores` (non-critical) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `toggle-never-unchecks` | toggle sets `completed: true` unconditionally | `toggle-twice-restores` (non-critical) only — every critical test only moves items active→completed | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-aria` | `aria-label` stripped from the `<select>` and every checkbox; no `<label>` anywhere | `filter-has-accessible-name` (non-critical); accessibility dimension fails via the `form-labels` builtin check (and axe `select-name`/`label`) | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- The starter itself fails all three critical tests (wrong item toggled under
  `active`, inverted counter, no `data-completed`), so an unmodified submission
  is never "solved".
- `remaining-count` text is compared after stripping whitespace so both gold's
  template string and alternative's multi-child `<output>` match `剩余N项`.

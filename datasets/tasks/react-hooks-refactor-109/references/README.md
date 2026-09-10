# references/ — host-only reference material for `react-hooks-refactor-109`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree). None of them contains `src/store.js`:
deleting the singleton is part of the required refactor, and the starter's
`src/reducer.js` is kept (gold) or reshaped (alternative) as the pure module.

## gold/

The canonical refactor. `src/hooks/useDashboard.js` wraps `React.useReducer`
over the unchanged pure `src/reducer.js`, keeps the textarea draft in a local
`useState`, and exposes memoised `increment` / `reset` / `addNote` callbacks;
`addNote` trims, ignores blank drafts and always clears the textarea.
`src/app.js` is the starter markup with the store calls swapped for the hook —
same testids, same `aria-label` on the textarea, same visible button text.
`tests/reducer.test.mjs` is the starter's unit test, unchanged. Passes all five
hidden tests, no horizontal overflow at 375px (`maxWidth: 360`), every control
has an accessible name.

## alternative/

Structurally different but behaviourally equivalent, to check the evaluator
rewards behaviour rather than gold's shape:

- the draft text lives **inside** the reducer state (`{ count, draft, notes }`)
  and is cleared by the reducer's `notes/commit` handler, so the hook holds no
  `useState`; actions are namespaced (`counter/increment`, `notes/commit`, …)
  and produced by exported action creators, dispatched through a handler map;
- `useDashboard` returns a `[state, boundActions]` tuple instead of an object;
- UI is split into `src/components/Counter.js` (a `<fieldset>` with an
  `<output data-testid="count">`) and `src/components/Notes.js` (a `<form>`
  whose submit button is `add-note`, a real `<label htmlFor="note-input">`, and
  an `<ol>` of `{ id, text }` notes);
- its own `tests/reducer.test.mjs` exercises the action creators and the
  commit/trim/clear semantics.

Expected outcome identical to gold except visual similarity, which is not
asserted because the layout legitimately differs.

## mutations/

Each mutation is gold with exactly one defect, plus an `expected.json`. Hidden
tests are named as in `evaluator/hidden/functional.spec.mjs`; the mapping is
from tracing each spec against the mutated code (no Docker run here).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `reset-does-not-zero` | hook dispatches `resetCount` (unknown type) so reset is a no-op; count stays 3 | `increment-then-reset` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `add-note-does-not-clear` | `setDraft("")` removed from `addNote`; note is appended but textarea keeps its text | `note-input-clears` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `store-still-mutated` | reducer wrapper reads a module-level `snapshot` that is never advanced, so every action applies to the initial state: second increment still shows 1, second note replaces the first | `increment-then-reset` (critical, never reaches 3), `add-two-notes` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `empty-note-added` | trim/empty guard dropped in `addNote`; blank submissions add empty `<li>`s | `empty-note-ignored` (non-critical) only — 4 items instead of 2 | `solved: true`, `scoreBelow.functional < 1` |
| `remove-labels` | textarea loses `aria-label` (no label/id); increment and reset buttons contain only `aria-hidden` glyphs, so their accessible names are empty | `controls-have-names` (non-critical) | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes: `remove-labels` also fails the non-critical `controls-have-names` hidden
test, so its functional score drops below 1 as well; `expected.json` only asserts
the accessibility dimension. In `empty-note-added` the empty `<li>` elements
still count for `note-item`, which is what the non-critical test detects.

# references/ — host-only reference material for `react-search-debounce-043`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree, so
every entry carries unchanged copies of `src/data/users.js` and
`src/api/searchUsers.js`. The fake API resolves slower for shorter queries
(`min(900, max(60, 1900 - 600 * len))` ms: "an" = 700ms, "ann" = 100ms,
"zzqxv" = 60ms), which is what makes the race observable.

## gold/

Single `src/app.js` plus a pure `src/requestTracker.js`. The query is held in
`useState`; an effect debounces it with a 150ms `setTimeout`, then takes a new
id from a module-level request tracker, sets `loading`, calls `searchUsers` and
ignores the response unless the id is still the latest. `deriveView()` shows
all 12 users for a blank query and only shows `empty-state` once the current
query has resolved with zero rows. Rows are a `<table>`; the input has an
`aria-label`. Unit test covers the tracker, the debounce constant and
`deriveView`.

## alternative/

Behaviourally equivalent, structurally different:

- debounce via a `useDebouncedValue` hook (`src/hooks/useDebouncedValue.js`);
- search state is a `useReducer` state machine (`src/searchState.js`,
  `idle | pending | done`) whose `resolve` action ignores responses whose query
  is not the current one, AND the effect aborts the previous request with an
  `AbortController` passed as `searchUsers(query, { signal })`;
- UI split into `SearchBox` (a `<form role="search">` with a real
  `<label htmlFor>` instead of `aria-label`) and `UserList` (`<ul>/<li>` rows
  with `aria-live` count). Unit test covers the reducer's stale-response rule.

## mutations/

Each mutation is gold with exactly one defect in `src/app.js`. Hidden tests:
`stale-response-ignored` (critical), `clear-input-restores-all` (critical),
`search-narrows-by-name-or-email` (critical), `empty-state-after-no-match`
(non-critical), `loading-state-while-pending` (non-critical),
`search-input-accessible-name` (non-critical).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `remove-stale-guard` | `if (!tracker.isCurrent(id)) return;` deleted; debounce intact | `stale-response-ignored` (critical): the "an" response (700ms) overwrites the 2 "ann" rows with 7 during the 900ms settle | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `no-debounce-no-guard` | debounce delay 0 AND stale guard deleted | `stale-response-ignored` (critical), same overwrite; results flicker per keystroke | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `wrong-filter-field` | API rows are re-filtered on `role` instead of name/email, so any name query yields 0 rows | `stale-response-ignored`, `clear-input-restores-all`, `search-narrows-by-name-or-email` (all critical) and `loading-state-while-pending` | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `remove-empty-state` | the `empty-state` branch is removed; an empty table renders instead | `empty-state-after-no-match` (non-critical) only | `solved: true`, `scoreBelow.functional < 1` |
| `remove-aria` | `aria-label` stripped from the input, leaving only a placeholder | `search-input-accessible-name` (non-critical); a11y `form-labels` flags the placeholder-only input | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

The mappings above were traced by hand against the timing constants; they have
not yet been run under the real Docker evaluator.

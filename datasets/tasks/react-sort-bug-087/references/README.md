# references/ — host-only reference material for `react-sort-bug-087`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/employees.js`. The starter has four bugs: in-place
`Array.prototype.sort` on the exported data, string comparison of salaries,
`reverse()`-based descending order (unstable for ties) and no `aria-sort`.

## gold/

The canonical fix. Sorting is extracted to `src/sorting.js`: `sortEmployees`
copies the list, decorates each row with its original index, sorts with a
sign-negated comparator (`sign * compare(a, b) || a.index - b.index`) so ties
keep source order in both directions, and compares numbers numerically.
`nextSort` toggles direction on the same column and resets to ascending on a
new one. `app.js` keeps a `<table>`, sets `aria-sort` (`ascending` /
`descending` / `none`) on each `<th scope="col">`, and renders header
`<button>`s with visible labels plus an `aria-hidden` indicator span on the
active column. Its unit test covers numeric compare, immutability, stability
and the toggle reducer.

## alternative/

A structurally different but behaviourally equivalent fix, used to check that
the evaluator rewards behaviour rather than gold's shape:

- pure logic lives in `src/sortRows.js`: a `Map` of row → original index feeds
  a comparator built with `Intl.Collator("en", { numeric: true })`; the tie
  break uses the map rather than a decorated array, and the copy is made with
  `Array.from`;
- state is a `useReducer` inside `src/useSortedRows.js` (`reduceSort` is the
  reducer) with a `useMemo`-ed result;
- UI is split into `src/components/SortHeader.js` and
  `src/components/EmployeeList.js` and rendered as an ARIA grid
  (`<div role="table">`, header `<div role="row">` with `role="columnheader"`
  cells, `<ul role="rowgroup">` / `<li role="row">` rows) instead of a
  `<table>`; `aria-sort` is only present on the active column header;
- header buttons get an explicit `aria-label` ("按姓名排序" …) in addition to
  their visible text; salary cells render `String(salary)`.

Expected outcome: `solved: true`, all hidden tests pass, no overflow at 375px,
every button has an accessible name. Visual similarity to gold baselines will
be lower because of the grid layout, so visual is not asserted.

## mutations/

Each mutation is gold's full `src/` + `tests/` with exactly one defect injected
in `src/app.js` (so gold's unit tests still pass and the build gate is not the
thing that fails), plus an `expected.json`. The per-test outcomes below were
traced by running the exact sort pipeline of each variant against the hidden
spec's assertions in Node (no browser available locally).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `string-compare-salary` | rows are mapped to `salary: String(salary)` before sorting, so `compareValues` never takes its numeric branch | `salary-numeric-ascending` (critical), `source-not-mutated` (critical; salary desc is not numerically ordered) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `unstable-sort` | descending = `ascending.reverse()` instead of a negated comparator, so equal departments come out in reverse source order | `department-descending-stable` (critical) only | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `mutate-source` | the sorted result is `splice`d back into the shared `employees` array and that array is rendered | `source-not-mutated` (critical) only — after name→salary→salary sorts the source order is scrambled, so the final department-ascending order puts David Yang before Ivan Wu | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `aria-sort-never-set` | `<th>` never receives `aria-sort` | `aria-sort-reflects-active-column` (non-critical) only | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-header-names` | header buttons render neither text nor `aria-label` (only the `aria-hidden` indicator on the active column) | `headers-are-named-buttons` (non-critical); accessibility dimension fails via `button-name` (built-in and axe) since all three buttons are nameless on initial load | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- `mutate-source` passes `department-descending-stable` because a stable
  descending sort of an array that is already stably ascending-sorted by the
  same key reproduces the source tie order; only the multi-column sequence in
  `source-not-mutated` exposes the mutation. `salary-numeric-ascending` passes
  because it only inspects salary values, not tie order.
- `remove-header-names` also fails the non-critical `headers-are-named-buttons`
  functional test, so its functional score is below 1 as well; `expected.json`
  only asserts the accessibility outcome.

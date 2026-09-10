# references/ — host-only reference material for `react-pagination-bug-076`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/products.js` (23 items, `PAGE_SIZE = 5`).

The starter `src/app.js` carries four defects: `next` increments past the last
page, `prev` decrements below 1, the total is `Math.floor(23 / 5) = 4`, and the
`?page=` query is read in a mount effect after `useState(1)` (and immediately
overwritten by the URL-sync effect), so a direct load of `/?page=3` renders page 1.

## gold/

The canonical fix. Pagination arithmetic is extracted into a pure
`src/pagination.js` (`totalPages` = ceil with a floor of 1, `clampPage`,
`parsePage`, `pageItems`) covered by `tests/pagination.test.mjs`. `src/app.js`
seeds `useState` lazily from `parsePage(location.search, total)`, syncs the URL
with `history.replaceState`, keeps the `<table>` markup and `aria-label`led
icon buttons, and disables `prev`/`next` at the boundaries (the click handlers
are also guarded). Passes all five hidden tests, no horizontal overflow at 375px.

## alternative/

A structurally different but behaviourally equivalent fix used to check that
the evaluator rewards behaviour rather than gold's shape:

- state is a `useReducer` inside `src/hooks/usePageState.js` whose pure
  reducer/parsers live in `src/pageState.js` (unit-tested in
  `tests/page-state.test.mjs`); `next`/`prev` actions are no-ops at the
  boundaries, the initial page comes from the reducer's lazy initialiser, URL
  sync uses `history.pushState` (not `replaceState`) and `popstate` is handled;
- UI is split into `src/components/ProductList.js` (a `<ul>/<li
  data-testid="product-row">` list instead of a `<table>`) and
  `src/components/Pager.js` (buttons labelled by visible text 上一页/下一页
  rather than `aria-label`, an `<output>` page indicator, `disabled` plus
  `aria-disabled` at the boundaries);
- the visible slice is a `useMemo`-ed `filter` by index rather than `slice`.

Expected outcome: `solved: true`, all hidden tests pass, responsive and
accessibility dimensions pass. Visual similarity to gold baselines will be lower
because of the list layout, so `visual` is not asserted.

## mutations/

Each mutation is gold with exactly one defect injected in `src/app.js`, plus an
`expected.json`. Results below are from tracing `evaluator/hidden/functional.spec.mjs`
against each tree (no Docker run yet).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `off-by-one-last-page` | `canNext = page <= total`; next stays enabled on page 5 and a click goes to page 6 (0 rows) | `next-stops-at-last-page` (critical), `pager-buttons-named-and-disabled` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `floor-total-pages` | `total = Math.floor(23 / 5) = 4` | `indicator-total-pages` (critical, "第 1 / 4 页"), `direct-load-page-3` (critical, indicator "第 3 / 4 页"), `next-stops-at-last-page` (critical, page 5 unreachable so 3 rows never appear), `pager-buttons-named-and-disabled` (`?page=5` clamps to 4) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `ignore-url-page` | `useState(1)` instead of `useState(initialPage)`; `?page=` never read | `direct-load-page-3` (critical) only; `pager-buttons-named-and-disabled` also fails since `?page=5` renders page 1 | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `prev-below-one` | `canPrev = page >= 1`; prev enabled on page 1 and a click goes to page 0 (0 rows) | `prev-stays-on-first-page` and `pager-buttons-named-and-disabled` (both non-critical) | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-button-names` | both `aria-label`s stripped; buttons contain only an `aria-hidden` glyph, so they have no accessible name | `pager-buttons-named-and-disabled` (non-critical); axe `button-name` should fail | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Note: `remove-button-names` relies on the accessibility evaluator flagging
buttons without an accessible name (axe `button-name`). Both buttons are
affected, so the failure does not depend on which control the checker inspects.

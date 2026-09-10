# references/ — host-only reference material for `react-orders-filter-017`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/orders.js`.

## gold/

The canonical solution: a single `src/app.js` using `React.useState` for
`{ q, status }`, `history.replaceState` for URL sync, a `<table>` of rows, a
`setTimeout(0)`-driven loading flag and a `<p data-testid="empty-state">`.
Passes all five hidden functional tests, has no horizontal overflow at 375px
and labels both controls with `aria-label`.

## alternative/

A structurally different but behaviourally equivalent implementation, used to
check that the evaluator rewards behaviour rather than gold's shape:

- state lives in a `useReducer` inside a custom hook
  `src/hooks/useUrlState.js`, which also parses the initial URL, serialises
  `?q=…&status=…`, syncs via `history.pushState` (not `replaceState`) and
  restores state on `popstate`;
- UI is split into `src/components/Filters.js` (a `<form role="search">` with
  real `<label htmlFor>` elements in addition to the `aria-label`s, same
  `data-testid`s and option values) and `src/components/OrdersTable.js`;
- rows are rendered as `<ul>/<li data-testid="order-row">` flex items instead
  of a `<table>`; each row still contains id, customer name and the same
  Chinese status label (待处理 / 已发货 / 已送达);
- the visible rows come from a `useMemo`-ed `selectVisible()` selector that
  matches order id **or** customer (gold concatenates them), trimming the query;
- loading is modelled as `data === null` resolved through a microtask
  (`Promise.resolve(orders)`) rather than a timer.

Expected outcome: `solved: true`, all hidden tests pass, no overflow at 375px,
all controls have accessible names. Visual similarity to the gold baselines will
be lower than gold's because of the list layout and labels, so the visual
dimension is the one place it may legitimately score below gold.

## mutations/

Each mutation is gold with exactly one defect injected in `src/app.js`, plus an
`expected.json` describing the outcome the evaluator must produce. All six were
run locally against a headless Chromium port of `evaluator/hidden/functional.spec.mjs`;
the per-test results below are observed, not guessed.

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `drop-search-handler` | search `onChange` is a no-op; controlled input never updates | `customer-search` (critical), `url-state-and-direct-load` (critical, `q` never reaches URL), `empty-state` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `wrong-status-param` | URL is written as `?q=…&state=…` instead of `status=` | `url-state-and-direct-load` (critical) only — in-page filtering and direct-load parsing still work | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `stale-request-overwrite` | status filtering computed once at mount from a ref captured in `useMemo(..., [])`; later status changes update select + URL but never narrow rows | `status-filter` (critical) only — direct load with `?status=delivered` still works because the ref is seeded from the URL, so `url-state-and-direct-load` passes | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `remove-empty-state` | renders `null` instead of `<p data-testid="empty-state">` when nothing matches | `empty-state` (non-critical) only | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-aria` | both `aria-label`s stripped; the `<select>` has no accessible name at all, the `<input>` keeps only a placeholder | none | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |
| `force-overflow` | `<table style="min-width:2000px">` | none; body/section `scrollWidth` becomes 2000 at 375px | `solved: true`, `dimensions.responsive: failed` |

Notes on uncertainty:

- `remove-aria`: axe's `label` rule accepts a placeholder as a fallback name for
  the input, so the accessibility failure is driven by the unlabeled `<select>`.
  If the accessibility evaluator only inspects `<input>` elements it will not
  trip; the expectation assumes a WCAG-style "form controls need names" check.
- `force-overflow`: the visual dimension will very likely also fall below
  threshold against the baselines; `expected.json` only asserts the responsive
  dimension so the fixture stays robust to baseline regeneration.

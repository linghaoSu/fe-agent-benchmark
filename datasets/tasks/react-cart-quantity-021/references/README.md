# references/ — host-only reference material for `react-cart-quantity-021`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree, so
every entry also carries an unchanged copy of `src/data/cart.js`
(1014×1, 2990×2, 100×98, 79900×1 分 → initial total ¥966.94, 102 件). The prices
are chosen so that summing `unitPrice / 100 × quantity` in floating point and
flooring back to cents is exact for the initial cart but off by one cent
(99683 vs 99684) after the first increment the hidden tests perform.

## gold/

Canonical solution: `src/app.js` keeps the item array in `React.useState` and
delegates all logic to the pure module `src/cart.js` (`changeQuantity` with a
1..99 clamp, `removeItem`, integer-cent `totalCents`, `itemCount`, and a
hand-rolled `formatCents` producing `¥1,234.50`). Rows are `<li data-testid="cart-row">`
flex items; the three per-row `<button>`s carry `aria-label`s and an
`aria-hidden` glyph; `<p data-testid="empty-cart">` replaces the list when empty.
`tests/cart.test.mjs` unit-tests the pure module. Passes all six hidden tests.

## alternative/

Behaviourally equivalent, structurally different:

- state is a normalised `{ order, byId }` object driven by `useReducer`
  (`src/store/cartReducer.js`); out-of-range increments/decrements return the
  same state object instead of clamping, and `selectSummary` accumulates cents
  and count in one pass;
- formatting uses `Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" })`
  in `src/money.js` (yields the same `¥1,765.94` string);
- UI is split into `components/CartRow.js` (a `<table>` row with `<th scope="row">`,
  an `<output data-testid="qty-value">`, `title`-named +/− buttons and an
  `aria-label`ed remove button) and `components/CartSummary.js` (a `<dl>`), with
  `<caption>` and a `<thead>`; the empty message is a `role="status"` paragraph.

Expected: `solved: true`, all hidden tests pass, no overflow at 375px, all
buttons named. Visual similarity to gold baselines is legitimately lower.

## mutations/

Each is gold with exactly one defect in `src/app.js` (gold's `src/cart.js` and
its unit tests are untouched so the build gate's `node --test` still passes).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `float-total` | total computed as `floor(Σ unitPrice/100 × qty × 100)` in floating point | `increment-updates-total` (critical): shows ¥996.83 instead of ¥996.84 | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `soft-delete-keeps-row` | remove sets quantity to 0 but keeps the row in the DOM | `remove-updates-count-and-total` (critical), `empty-cart-message` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `decrement-below-one` | quantity handler only applies the 99 ceiling; decrement at 1 gives 0 | `decrement-floors-at-one` (critical) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `no-thousands-separator` | total rendered via `(cents/100).toFixed(2)` → `¥1765.94` | `total-uses-thousands-separator` (non-critical) only; every critical path stays below ¥1,000 | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-aria` | all three row buttons lose `aria-label` and contain only an empty `aria-hidden <i>` icon | none | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- `float-total` relies on IEEE-754 summation order `1014/100×1 + 2990/100×3 + 100/100×98 + 79900/100×1`
  = 996.8399999999999; other test states (remove, decrement, cap, ×2 keyboard,
  empty) happen to be exact so only the increment test trips.
- `remove-aria`: buttons have no text, `aria-label`, `aria-labelledby`, `title`
  or `img[alt]`, so both axe `button-name` (critical impact) and the builtin
  `button-name` check fail on every viewport.

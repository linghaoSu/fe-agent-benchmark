# references/ — host-only reference material for `react-tabs-keyboard-054`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree, so
every entry also carries an unchanged copy of `src/data/tabs.js`. Every entry's
`tests/` directory must pass under `node --test` together with the public smoke
test.

## gold/

The canonical solution: `src/app.js` renders the strip as `<div role="tablist"
aria-label="设置分类">` containing `<button role="tab">` elements (`id`,
`aria-selected`, `aria-controls`, roving `tabIndex` 0/-1) and a single
`<div role="tabpanel" aria-labelledby>`. Active index lives in `useState`;
a ref array is used to move DOM focus whenever selection changes via keyboard.
Key handling is extracted into the pure module `src/keyboard.js`
(`nextTabIndex(key, current, count)` with wrap-around for ArrowLeft/ArrowRight,
Home/End, and `isActivationKey` for Enter/Space) with a unit test in
`tests/keyboard.test.mjs`. Passes all five hidden tests, has no horizontal
overflow at 375px and no axe wcag2a/aa violations.

## alternative/

Structurally different, behaviourally equivalent implementation:

- state is `{ activeId, focusTick }` in a `useReducer` (`src/tabsReducer.js`)
  keyed by tab **id** rather than index; `focusTick` increments on keyboard
  navigation and a `useEffect` in `TabList` focuses `document.getElementById(...)`
  (no refs);
- one delegated `onKeyDown` on the tablist (reads the focused tab from
  `event.target.closest('[role=tab]')`) instead of a handler per tab;
- tabs are `<span role="tab">` rather than `<button>`; the tablist also carries
  `aria-orientation="horizontal"`; the panel text is wrapped in a `<p>`;
- UI split into `src/components/TabList.js` and `src/components/TabPanel.js`;
  unit test `tests/tabs-reducer.test.mjs`.

Same `data-testid`s, same DOM ids per tab/panel semantics, same expected
outcome as gold (visual similarity may be lower due to the `<span>` markup).

## mutations/

Each mutation is gold with exactly one defect injected in `src/app.js` (the
pure `keyboard.js` and its unit test are left untouched so `node --test` still
passes), plus an `expected.json`. Mapping to hidden tests
(`evaluator/hidden/functional.spec.mjs`), traced by hand:

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `no-wraparound` | keydown handler keeps the current tab for ArrowLeft at index 0 / ArrowRight at the last index | `arrow-left-wraps-to-last` (critical) | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `arrow-moves-focus-not-selection` | Arrow/Home/End only call `.focus()` on the target tab; `setActive` is never called from the keyboard | `arrow-right-moves-focus-and-selection` (critical), `arrow-left-wraps-to-last` (critical), `end-jumps-to-last` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `click-does-not-update-panel` | panel always renders `tabs[0].panel` | `click-selects-and-updates-panel` (critical), `arrow-right-moves-focus-and-selection` (critical), `arrow-left-wraps-to-last` (critical), `end-jumps-to-last` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `missing-end-key` | keydown handler returns early for `End` | `end-jumps-to-last` (non-critical) only | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-roles-and-labels` | strips `role="tablist"` + `aria-label` from the strip, `role="tab"` + `aria-controls` from the tabs, `role="tabpanel"` + `aria-labelledby` from the panel; `aria-selected` stays on plain `<button>`s | `tab-roles-and-single-selection` (non-critical) only — all click/keyboard/focus behaviour is intact | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes on uncertainty:

- `remove-roles-and-labels`: the accessibility failure relies on axe-core's
  `aria-allowed-attr` rule (wcag2a, impact `serious`) firing because
  `aria-selected` is not permitted on a native `<button>` without `role="tab"`.
  The builtin checks (`form-labels`, `button-name`, …) do not cover tab
  semantics, so if axe is not available the accessibility dimension will not
  trip for this mutation.

# references/ — host-only reference material for `react-responsive-nav-098`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/nav.js`.

## gold/

The canonical solution. `src/responsive.js` is a pure module exporting the
`(max-width: 767px)` media query, the `navListVisible({ mobile, open })` rule,
`toggleLabel(open)` and a `styles()` string that `src/app.js` injects through a
`<style>` element. A `useMobile()` hook seeds state from
`window.matchMedia(...).matches` and subscribes to `change`. On mobile the nav
renders a `<button data-testid="nav-toggle">` with `aria-label`,
`aria-expanded` and `aria-controls="primary-nav-list"`; the `<ul
data-testid="nav-list">` is toggled with the `hidden` attribute. Cards live in a
CSS grid (`repeat(3, minmax(0, 1fr))`, one `minmax(0, 1fr)` column under the
media query), so nothing is wider than the viewport at 375px. Passes all six
hidden tests; `tests/responsive.test.mjs` unit-tests the pure module.

## alternative/

A structurally different but behaviourally equivalent implementation:

- state is a `useReducer` (`viewport` / `toggle` actions) in `src/layout.js`,
  which also computes inline style objects from the `mobile` flag — there is no
  `<style>` tag at all;
- `src/hooks/useMediaQuery.js` wraps `matchMedia` + `change` listener and calls
  back into the reducer;
- UI is split into `src/components/Nav.js` and `src/components/Cards.js`; the
  link list is a `<div role="list" data-testid="nav-list">` of `<a
  role="listitem">` anchors (not `<ul>/<li>`), hidden with `display: none`;
- the toggle has a visible text label (打开菜单 / 关闭菜单) instead of an
  `aria-label`, `aria-expanded` is passed as a boolean (React serialises it to
  `"true"`/`"false"`), `aria-controls="site-links"`;
- cards are a wrapping flexbox whose items use `flex: 1 1 100%` on mobile and
  `flex: 1 1 0` otherwise.

Expected outcome identical to gold except for visual similarity to the gold
baselines, which may legitimately be lower (different colours/markup), so
`expected.json` does not assert the visual dimension.

## mutations/

Each mutation is gold with exactly one defect injected in `src/app.js` (the
`tests/` copy is unchanged and still passes), plus an `expected.json`.

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `cards-fixed-width` | each card gets inline `width: 420px`; single-column grid still overflows at 375px (scrollWidth 452) | `mobile-no-horizontal-overflow` (non-critical) | `solved: true`, `dimensions.responsive: failed` (visual likely also fails) |
| `nav-no-collapse` | `const mobile = false` replaces `useMobile()`; no toggle is ever rendered, 7 links always shown | `mobile-nav-collapsed-by-default` (critical), `mobile-toggle-reveals-all-links` (critical), both non-critical toggle tests | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `toggle-does-nothing` | `onClick` removed from the toggle; list never opens on mobile | `mobile-toggle-reveals-all-links` (critical), `toggle-reports-aria-expanded` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `no-aria-expanded` | `aria-expanded` attribute dropped from the toggle; behaviour otherwise intact | `toggle-reports-aria-expanded` (non-critical) only | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-toggle-label` | `aria-label` removed and the visible text replaced by an `aria-hidden` hamburger `<span>`; button has an empty accessible name | `toggle-has-accessible-name` (non-critical) | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- `cards-fixed-width` deliberately does not fail any critical test: the
  overflow check is non-critical in the hidden spec because the responsive
  evaluator is the authoritative check for it.
- `remove-toggle-label` relies on an axe-style `button-name` rule; the hidden
  `toggle-has-accessible-name` test also fails, so the functional score drops
  below 1 as well (not asserted, to keep the fixture minimal).
- Results above come from tracing the spec against each tree (no Docker on the
  authoring host); the `desktop-shows-links-without-toggle` test passes for every
  mutation because none of them touch the desktop branch.

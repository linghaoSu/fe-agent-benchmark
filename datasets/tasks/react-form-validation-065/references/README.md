# references/ — host-only reference material for `react-form-validation-065`

Everything in this directory is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and must never be exposed to the Agent.

Each `*/src/` directory is a complete replacement for the task's `src/` tree
(the mock scenario writes the whole tree), so every entry also carries an
unchanged copy of `src/data/fields.js`.

## gold/

The canonical solution: `src/validate.js` exports per-field validators plus
`validateForm(values)` returning a `{ field: 中文错误 }` map, and `src/app.js`
keeps `values` / `errors` / `status` / `submitting` in four `useState`s. On
submit it runs `validateForm`, stores the errors, and either sets a Chinese
failure status or awaits a 100 ms promise with the button `disabled` before
setting `提交成功`. Each invalid input gets `aria-invalid="true"` and
`aria-describedby` pointing at a `<p id data-testid="error-<field>" role="alert">`;
inputs are named via `<label htmlFor>`. Passes all six hidden tests, no
horizontal overflow at 375px (form `maxWidth: 360px`).

## alternative/

A structurally different but behaviourally equivalent implementation:

- validation is a declarative rule table (`RULES` in `src/validate.js`, two
  rules per field, first failing rule wins) instead of hand-written functions;
  messages differ from gold's but are all Chinese;
- form state is a `useReducer` inside `src/hooks/useRegistration.js` with an
  explicit `phase` (`idle | invalid | submitting | success`); the fake delay is a
  `setTimeout` effect keyed on the phase, not an awaited promise;
- markup is `<fieldset disabled={busy}>` + `<legend>` + `<ul><li>` rows rendered
  by `src/components/Field.js`; error text is a `<span role="alert">`, and the
  status region is an `<output aria-live>` element;
- ids use a `reg-` prefix and different button/heading copy.

Expected outcome identical to gold except visual similarity is not asserted.

## mutations/

Each mutation is gold with exactly one defect injected in `src/app.js` (the
pure `validate.js` and its unit tests stay intact so `node --test` still passes).

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `confirm-not-compared` | submit validates `{ ...values, confirm: values.password }`, so confirm is never compared | `mismatched-confirm-only-error` (critical) — no `error-confirm`, status becomes 提交成功. `empty-submit-shows-all-errors` still passes because an empty password yields an empty confirm | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `email-accepts-anything` | `delete next.email` whenever the email field is non-empty | `invalid-email-rejected` (critical) — no `error-email`, status becomes 提交成功 | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `success-shown-despite-errors` | the `if (errors) return` guard is removed; errors render but the fake submit always runs | `empty-submit-shows-all-errors`, `mismatched-confirm-only-error`, `invalid-email-rejected` (all critical) — each waits ~400 ms after the errors appear and then finds 提交成功 in `form-status` | `solved: false`, `criticalFunctionalTests: failed`, `FUNCTIONAL_CRITICAL_FAILED` |
| `aria-invalid-never-set` | the `aria-invalid` attribute is dropped from inputs (`aria-describedby` and error elements remain) | `short-password-marks-aria-invalid` (non-critical) only | `solved: true`, `criticalFunctionalTests: passed`, `scoreBelow.functional < 1` |
| `remove-labels` | the `<label htmlFor>` elements are removed; inputs have no accessible name at all | `inputs-have-labels` (non-critical) | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- `remove-labels` also fails the non-critical `inputs-have-labels` functional
  test, so its functional score is below 1 as well; `expected.json` only asserts
  the accessibility dimension so the fixture stays robust to evaluator changes.
- The hidden spec deliberately waits ~400 ms (`settle`) after errors appear in
  the three "no success" tests so that an implementation which wrongly starts the
  100 ms fake submission has already written 提交成功 by the time it is checked.

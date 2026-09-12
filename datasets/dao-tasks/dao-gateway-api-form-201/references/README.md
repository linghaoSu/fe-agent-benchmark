# references/ — host-only reference material for `dao-gateway-api-form-201`

Everything here is for the evaluation host only. It is listed under
`permissions.forbiddenPaths` in `task.yaml` and is never mounted into the Agent
sandbox.

Each reference directory ships the writable trees it replaces (`src/**`,
`tests/**`; written verbatim by the mock scenario) plus a `.deleted` manifest
listing the scaffold files it removes (`src/views/HomeView.vue`,
`tests/unit/example.spec.ts`). The rest of the starter (rsbuild config, plugins,
locales, `server.mjs`) is untouched.

## gold/

Composable-driven store (`useApiForm.ts`, provide/inject) with a hand-written
validation module (`validation.ts`), one component per step under
`components/`, `DaoStepper` from `@dao-style/extend` for the step header and a
`role="switch"` button component for the toggles. `model.ts` owns the constants,
defaults and `buildPayload()`. Passes all 14 hidden tests, is axe-clean on
every step at 1440/768/375, has no horizontal overflow, and is the source of the
visual baselines (`pnpm eval baseline … --scenario reference:gold`).

## alternative/

Behaviourally identical, structurally different:

- a Pinia store (`src/stores/api-draft-store.ts`) holds draft, step and error map;
- validation is a set of **yup** schemas per step (`api-schema.ts`) with a
  path normaliser mapping `routes[0].services[1].weight` to the dotted
  `error-*` ids;
- a generic `Field` (form item + error text via scoped slot), `Pick`
  (DaoSelect wrapper taking `[value,label]` pairs) and a native-checkbox
  `Toggle` replace gold's per-purpose components;
- the step indicator is hand-drawn (`.alt-steps`) instead of `DaoStepper`;
- numeric "unset" is `null` rather than `undefined`; header/param rows are laid
  out with a single CSS grid instead of per-row grids.

Expected: `solved: true`, all hidden tests pass, responsive + accessibility
pass. Visual similarity to gold's baselines is legitimately lower
(`VISUAL_MISMATCH`), so `expected.json` does not assert the visual dimension.

## mutations/

Each mutation is gold with exactly one defect. Results below were observed by
running the hidden spec against a local build of each mutation and by the
Docker calibration run.

| mutation | defect | hidden tests failing | expected |
| --- | --- | --- | --- |
| `weights-not-validated` | weight-sum check fires only when `sum > 100` | `route-weights-sum-100` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `next-does-not-validate` | 下一步 shows errors but always advances | every blocking test on steps 1–2 (7 critical + 2 non-critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `prev-loses-values` | 上一步 resets the form to defaults | `prev-keeps-values` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `timeout-max-unchecked` | upper bound (5 min) removed from 超时时长 | `step2-timeout-max-5` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `payload-wrong-shape` | `pathType/path/methods` emitted at top level instead of under `match` | `submit-produces-payload` (critical) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `missing-error-linkage` | `aria-invalid` / `aria-describedby` removed from the API 名称 input | `step1-empty-next-blocked` (critical: asserts linkage) | `solved: false`, `FUNCTIONAL_CRITICAL_FAILED` |
| `overflow-at-mobile` | `.api-rows { min-width: 640px }` | none; `scrollWidth` = 685 at 375px | `solved: true`, `dimensions.responsive: failed` |
| `no-labels` | hidden `<label for="field-name">` removed | none; axe `label` (critical) + builtin `form-labels` fail on step 1 | `solved: true`, `dimensions.accessibility: failed`, `scoreBelow.accessibility < 1` |

Notes:

- Mutations ship gold's unit test with the assertion that would expose the
  defect adjusted (e.g. the 60+30 weight case becomes 50+50, the 500-minute
  timeout case becomes 0), so `pnpm exec vitest run` stays green and the
  build gate passes; only the hidden functional spec (or the quality
  evaluators) catch the defect.

- `missing-error-linkage` is caught functionally rather than by the a11y
  evaluator: axe does not flag a missing `aria-describedby`, so the hidden
  `step1-empty-next-blocked` test asserts the linkage explicitly.
- `no-labels`: the DaoInput keeps no placeholder, so both axe and the builtin
  check treat it as unlabeled. The a11y evaluator only visits the initial
  route, which is why the defect is on step 1.

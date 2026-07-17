# Gate Test Plan — frontend-agent-benchmark

> Mode: `gate`  
> Stage: V0 — Contracts and deterministic fixtures  
> Status: green; original red evidence retained  
> Date: 2026-07-13

## Selected vertical slice

`GATE-V0-001` validates the published Task fixture through the V0 public CLI
seam:

```bash
pnpm eval validate examples/task.yaml
```

The expected value comes from the approved architecture V0 observable behavior:
the command succeeds and emits structured output for the valid fixture. It also
supports FR-001's requirement that Task validation occurs before Agent launch.

| Test ID | Public seam | Test file | Expected behavior |
|---|---|---|---|
| `GATE-V0-001` | `pnpm eval validate examples/task.yaml` | `tests/gate/v0-contract-validation.test.mjs` | Exit code 0 and parseable structured JSON for `examples/task.yaml` |
| `GATE-V0-002` | `pnpm eval validate tests/fixtures/tasks/unknown-property.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.additional_property` at `/unexpected` |
| `GATE-V0-003` | `pnpm eval validate tests/fixtures/tasks/missing-required-field.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.required` at `/title` |
| `GATE-V0-004` | `pnpm eval validate tests/fixtures/tasks/unsupported-major-schema-version.yaml` | `tests/gate/v0-contract-errors.test.mjs` | Non-zero exit and `schema.unsupported_major` at `/schemaVersion` |

## Red evidence

Command:

```bash
node --test tests/gate/v0-contract-validation.test.mjs
```

Observed: failed as intended. The assertion expected exit code 0 and received
1. The direct public command reports:

```text
ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND No package.json (or package.yaml, or package.json5) was found.
```

This is a missing V0 public CLI/package scaffold, not a test-runner or fixture
syntax failure: Node `v26.4.0` and pnpm `10.34.2` are available, and the test
runner executed the assertion normally.

## Green evidence

Commands:

```bash
node --test tests/gate/v0-contract-validation.test.mjs
node --test tests/gate/v0-contract-errors.test.mjs
```

Observed on 2026-07-17: `GATE-V0-001` passed (1/1), and the three invalid
fixture cases passed (3/3).

## Scope boundary

- This slice covers only pure Task YAML structural validation and the supported
  schema major check.
- Cache preflight, sensitive-data validation, task execution, and all later
  runtime packages remain outside this V0 slice.

## Handoff

V0's requested contract-validation slice is green. Do not begin later runtime
stages without a separately approved stage and gate.

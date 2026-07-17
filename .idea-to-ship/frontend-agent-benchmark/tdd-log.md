# TDD Log — frontend-agent-benchmark

## 2026-07-13 — V0 gate

- Test ID: `GATE-V0-001`
- Intent: validate `examples/task.yaml` through the documented public command
  `pnpm eval validate examples/task.yaml`.
- Test first: `tests/gate/v0-contract-validation.test.mjs` was added before any
  production implementation.
- Command: `node --test tests/gate/v0-contract-validation.test.mjs`
- Result: red, 1 failing / 0 passing.
- Failure: expected CLI exit code `0`, received `1` because the repository has
  no package manifest or `eval` command (`ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND`).
- Interpretation: intended missing V0 behavior; Node and pnpm are available,
  so this is not an environment or fixture-syntax failure.
- Production changes: none.
- Next: `$idea-to-ship:implement --slug frontend-agent-benchmark --stage V0`
  should make this single gate green before expanding coverage.

## 2026-07-17 — V0 implementation

- Existing red gate retained: `GATE-V0-001` remained unmodified.
- Added acceptance cases: `GATE-V0-002` unknown property,
  `GATE-V0-003` missing required field, and `GATE-V0-004` unsupported major
  schema version.
- Public seam: `pnpm eval validate <task-yaml>`.
- Commands:
  - `node --test tests/gate/v0-contract-validation.test.mjs`
  - `node --test tests/gate/v0-contract-errors.test.mjs`
- Result: green, 1/1 valid-fixture test and 3/3 invalid-fixture tests passing.
- Production change: minimal root/workspace manifests, `apps/cli`, and
  `packages/contracts` with YAML parsing, Draft 2020-12 structural validation,
  normalized errors, and a supported-major semantic check.

## 2026-07-17 — V0 gate green

- Implementation: Codex (sol, xhigh) created the pnpm workspace scaffold
  (`apps/cli` + `packages/contracts`), the `pnpm eval validate` command with
  Ajv Draft 2020-12 structural validation plus semantic `domain.code` errors,
  and tightened `schemas/task.schema.json` per architecture §8.1
  (`schemaVersion`, `additionalProperties: false`, explicit `extensions`
  namespace); `examples/task.yaml` gained `schemaVersion: 1`.
- Command: `node --test tests/gate/*.test.mjs`
- Result: green, 4 passing / 0 failing — `GATE-V0-001` plus three new
  `GATE-V0-002` invalid-fixture cases (unknown property, missing required
  field, unsupported schema major version).
- CLI evidence: `pnpm eval validate examples/task.yaml` exits 0 and emits
  `{"valid":true,"taskId":"react-orders-filter-017",...}`.
- Next: expand V0 coverage (result schema, checksum) or start V1
  (SQLite state store, immutable Run input).

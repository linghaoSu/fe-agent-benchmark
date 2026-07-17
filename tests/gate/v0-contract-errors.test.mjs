import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);

const cases = [
  {
    id: "GATE-V0-002",
    name: "rejects an unknown property",
    fixture: "tests/fixtures/tasks/unknown-property.yaml",
    code: "schema.additional_property",
    location: "/unexpected",
  },
  {
    id: "GATE-V0-003",
    name: "rejects a missing required field",
    fixture: "tests/fixtures/tasks/missing-required-field.yaml",
    code: "schema.required",
    location: "/title",
  },
  {
    id: "GATE-V0-004",
    name: "rejects an unsupported schema major version",
    fixture: "tests/fixtures/tasks/unsupported-major-schema-version.yaml",
    code: "schema.unsupported_major",
    location: "/schemaVersion",
  },
];

for (const fixtureCase of cases) {
  test(`${fixtureCase.id}: ${fixtureCase.name} with a stable error`, () => {
    const result = spawnSync("pnpm", ["eval", "validate", fixtureCase.fixture], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
    assert.notEqual(result.status, 0, "invalid Tasks must fail validation");

    const output = JSON.parse(result.stdout);
    assert.equal(output.valid, false);
    assert.ok(
      output.errors.some(
        (error) => error.code === fixtureCase.code && error.location === fixtureCase.location,
      ),
      `expected ${fixtureCase.code} at ${fixtureCase.location}; received ${result.stdout}`,
    );
  });
}

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);
const validResult = JSON.parse(
  readFileSync(new URL("../../examples/result.json", import.meta.url), "utf8"),
);

function validate(path) {
  return spawnSync("pnpm", ["eval", "validate", path], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function validateMutation(mutate) {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-result-"));
  const path = join(directory, "result.json");
  const result = structuredClone(validResult);
  mutate(result);
  writeFileSync(path, JSON.stringify(result));

  try {
    return validate(path);
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test("GATE-V0-005: validates the published Result fixture through the public CLI", () => {
  const result = validate("examples/result.json");

  assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
  assert.equal(result.status, 0, `expected Result validation to succeed; stderr:\n${result.stderr}`);

  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.kind, "result");
  assert.equal(output.runId, validResult.runId);
});

const invalidCases = [
  {
    id: "GATE-V0-006",
    name: "rejects an unknown property",
    mutate: (result) => { result.unexpected = true; },
    code: "schema.additional_property",
    location: "/unexpected",
  },
  {
    id: "GATE-V0-007",
    name: "rejects a missing required property",
    mutate: (result) => { delete result.schemaVersion; },
    code: "schema.required",
    location: "/schemaVersion",
  },
  {
    id: "GATE-V0-008",
    name: "rejects an unsupported schema major version",
    mutate: (result) => { result.schemaVersion = 2; },
    code: "schema.unsupported_major",
    location: "/schemaVersion",
  },
];

for (const fixtureCase of invalidCases) {
  test(`${fixtureCase.id}: ${fixtureCase.name} with a stable error`, () => {
    const result = validateMutation(fixtureCase.mutate);

    assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
    assert.notEqual(result.status, 0, "invalid Results must fail validation");

    const output = JSON.parse(result.stdout);
    assert.equal(output.valid, false);
    assert.equal(output.kind, "result", "the fixture must be validated as a Result");
    assert.ok(
      output.errors.some(
        (error) => error.code === fixtureCase.code && error.location === fixtureCase.location,
      ),
      `expected ${fixtureCase.code} at ${fixtureCase.location}; received ${result.stdout}`,
    );
  });
}

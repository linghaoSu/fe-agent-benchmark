import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);

const cases = [
  ["task", "/title"],
  ["suite", "/manifestChecksum"],
  ["run", "/inputHash"],
  ["attempt", "/ordinal"],
  ["adapter-protocol", "/timestamp"],
  ["tool-call", "/tool"],
  ["evaluator-result", "/status"],
  ["artifact-manifest", "/status"],
  ["result", "/solved"],
  ["comparison-report", "/comparisons"],
  ["dependency-cache-snapshot", "/lockfileHash"],
  ["network-policy", "/defaultAction"],
  ["producer-record", "/privateCode"],
  ["export-manifest", "/entries"],
  ["requester-export-result", "/publicOutcomeCode"],
  ["data-scan-result", "/outcome"],
  ["data-scan-coverage-policy", "/requiredSurfaces"],
  ["proxy-diagnostic-record", "/trustedObservation"],
];

function validate(kind, fixture) {
  return spawnSync(
    "node",
    ["apps/cli/dist/index.js", "validate", `tests/fixtures/${kind}/${fixture}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function output(result) {
  assert.equal(result.error, undefined, `CLI must be executable: ${result.error}`);
  return JSON.parse(result.stdout);
}

for (const [kind, missingLocation] of cases) {
  test(`GATE-V0.3-${kind}: validates the ${kind} contract matrix`, () => {
    const valid = validate(kind, "valid.json");
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.deepEqual(
      { valid: output(valid).valid, kind: output(valid).kind },
      { valid: true, kind },
    );

    for (const [fixture, code, location] of [
      ["unknown-property.json", "schema.additional_property", "/unexpected"],
      ["missing-required.json", "schema.required", missingLocation],
    ]) {
      const invalid = validate(kind, fixture);
      assert.notEqual(invalid.status, 0, `${kind}/${fixture} must fail`);
      const body = output(invalid);
      assert.equal(body.kind, kind);
      assert.ok(
        body.errors.some((error) => error.code === code && error.location === location),
        `expected ${code} at ${location}; received ${invalid.stdout}`,
      );
    }

    const unsupported = validate(kind, "unsupported-major-schema-version.json");
    assert.notEqual(unsupported.status, 0, `${kind} unknown major must fail`);
    const body = output(unsupported);
    assert.equal(body.kind, kind);
    assert.deepEqual(
      body.errors.map(({ code, location }) => ({ code, location })),
      [{ code: "schema.unsupported_major", location: "/schemaVersion" }],
      "unknown-major rejection must precede the fixture's additional-property error",
    );
  });
}

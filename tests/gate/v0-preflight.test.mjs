import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);

const cases = [
  {
    fixture: "invalid-task",
    code: "schema.additional_property",
    file: "task.yaml",
    location: "/unexpected",
  },
  {
    fixture: "missing-lockfile",
    code: "DEPENDENCY_LOCK_INVALID",
    file: "pnpm-lock.yaml",
    location: "",
  },
  {
    fixture: "unpinned-dependency",
    code: "DEPENDENCY_LOCK_INVALID",
    file: "pnpm-lock.yaml",
    location: "/packages/left-pad@latest",
  },
  {
    fixture: "cache-miss",
    code: "DEPENDENCY_CACHE_MISS",
    file: "dependency-cache-snapshot.json",
    location: "/extensions/packages",
    missingPackages: ["left-pad@1.3.0"],
  },
  {
    fixture: "embedded-fake-credential",
    code: "DATA_SCAN_CREDENTIAL_DETECTED",
    file: "synthetic-credential.txt",
    location: "/line/1",
  },
];

function preflight(fixture) {
  return spawnSync(
    "pnpm",
    ["eval", "preflight", `tests/fixtures/preflight/${fixture}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

test("GATE-V0.4-001: accepts a fully pinned synthetic bundle", () => {
  const result = preflight("passing");

  assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { preflight: "passed" });
});

for (const fixtureCase of cases) {
  test(`GATE-V0.4-${fixtureCase.fixture}: rejects before Agent or sandbox launch`, () => {
    const result = preflight(fixtureCase.fixture);

    assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
    assert.notEqual(result.status, 0, `${fixtureCase.fixture} must fail preflight`);

    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      Object.keys(output).sort(),
      ["codes", "preflight"],
      "static rejection must not create Agent, Attempt, or sandbox output",
    );
    assert.equal(output.preflight, "rejected");
    assert.deepEqual(
      output.codes.map(({ code, file, location, missingPackages }) => ({
        code,
        file,
        location,
        ...(missingPackages ? { missingPackages } : {}),
      })),
      [{
        code: fixtureCase.code,
        file: fixtureCase.file,
        location: fixtureCase.location,
        ...(fixtureCase.missingPackages
          ? { missingPackages: fixtureCase.missingPackages }
          : {}),
      }],
    );
  });
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);

test("GATE-V0-001: validates the published task fixture through the public CLI", () => {
  const command = ["eval", "validate", "examples/task.yaml"];
  const result = spawnSync("pnpm", command, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
  assert.equal(
    result.status,
    0,
    `expected \`pnpm ${command.join(" ")}\` to succeed; stderr:\n${result.stderr}`,
  );
  assert.doesNotThrow(
    () => JSON.parse(result.stdout),
    "successful validation must emit structured JSON",
  );
});

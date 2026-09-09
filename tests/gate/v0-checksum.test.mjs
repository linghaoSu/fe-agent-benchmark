import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = new URL("../..", import.meta.url);

function checksum(path) {
  const result = spawnSync("pnpm", ["eval", "checksum", path], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.error, undefined, `pnpm must be executable: ${result.error}`);
  assert.equal(result.status, 0, `expected checksum to succeed; stderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test("GATE-V0-009: directory checksums are deterministic and byte-sensitive", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-bundle-"));
  const outsideFile = join(directory, "..", `${directory.split("/").at(-1)}-outside.txt`);
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "task.yaml"), "schemaVersion: 1\nid: example\n");
  writeFileSync(join(directory, "assets", "input.txt"), "alpha");
  writeFileSync(join(directory, "assets-raw.txt"), "root file");
  writeFileSync(outsideFile, "not part of the bundle");
  symlinkSync(outsideFile, join(directory, "outside-link"));

  try {
    const first = checksum(directory);
    const second = checksum(directory);

    assert.deepEqual(second, first);
    assert.deepEqual(
      first.files.map((file) => file.path),
      ["assets-raw.txt", "assets/input.txt", "task.yaml"],
      "files must be sorted by relative path and symlinks must not be followed",
    );
    assert.match(first.bundleChecksum, /^sha256:[a-f0-9]{64}$/);

    writeFileSync(join(directory, "assets", "input.txt"), "alphb");
    const changed = checksum(directory);
    assert.notEqual(changed.bundleChecksum, first.bundleChecksum);
  } finally {
    rmSync(directory, { recursive: true });
    rmSync(outsideFile);
  }
});

test("GATE-V0-010: a Task YAML file is a deterministic single-file bundle", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-agent-task-"));
  const taskPath = join(directory, "task.yaml");
  writeFileSync(taskPath, "schemaVersion: 1\nid: example\n");

  try {
    const first = checksum(taskPath);
    const second = checksum(taskPath);

    assert.deepEqual(second, first);
    assert.deepEqual(first.files.map((file) => file.path), ["task.yaml"]);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

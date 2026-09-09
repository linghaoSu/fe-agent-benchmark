import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const artifacts = new URL("../../packages/artifact-store-fs/dist/index.js", import.meta.url);
function tree() {
  const root = join(tmpdir(), `fab-v33-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.js"), "export const app = 1;\n");
  writeFileSync(join(root, "node_modules"), "excluded");
  return root;
}
function writable(path) { const stat = lstatSync(path); chmodSync(path, stat.mode | 0o222); if (stat.isDirectory()) readdirSync(path).forEach((name) => writable(join(path, name))); }
test("GATE-V3.3-001: frozen snapshot digest is deterministic and records exclusions", async () => {
  const { collectFrozenSnapshot } = await import(artifacts); const root = tree(); const one = `${root}-one`, two = `${root}-two`;
  try {
    const first = collectFrozenSnapshot(root, one, ["node_modules"]); const second = collectFrozenSnapshot(root, two, ["node_modules"]);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(JSON.parse(readFileSync(join(one, "snapshot-manifest.json"))), JSON.parse(readFileSync(join(two, "snapshot-manifest.json"))));
    writeFileSync(join(root, "src", "app.js"), "export const app = 2;\n");
    assert.notEqual(first.digest, collectFrozenSnapshot(root, `${root}-three`, ["node_modules"]).digest);
    assert.equal(lstatSync(join(one, "src", "app.js")).mode & 0o222, 0);
  } finally { [one, two, `${root}-three`].forEach((p) => { try { writable(p); } catch {} }); [root, one, two, `${root}-three`].forEach((p) => removeTree(p)); }
});
for (const [name, make] of [["symlink", (root) => symlinkSync("/tmp", join(root, "bad"))], ["hardlink", (root) => { writeFileSync(join(root, "source"), "x"); linkSync(join(root, "source"), join(root, "bad")); }], ["fifo", (root) => spawnSync("mkfifo", [join(root, "bad")])]]) test(`GATE-V3.3-002: collector rejects ${name}`, async () => {
  const { collectFrozenSnapshot, ArtifactStoreError } = await import(artifacts); const root = tree();
  try { make(root); assert.throws(() => collectFrozenSnapshot(root, `${root}-out`), (error) => error instanceof ArtifactStoreError && error.code === "SNAPSHOT_UNSAFE_ENTRY"); }
  finally { removeTree(root); rmSync(`${root}-out`, { recursive: true, force: true }); }
});

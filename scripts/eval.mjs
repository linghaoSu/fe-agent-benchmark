import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const cli = join(root, "apps/cli/dist/index.js");

function newest(path) {
  const metadata = statSync(path);
  if (metadata.isFile()) return metadata.mtimeMs;
  return Math.max(...readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.name !== "dist" && entry.name !== "node_modules")
    .map((entry) => newest(join(path, entry.name))));
}

let build = false;
try {
  const compiledAt = statSync(cli).mtimeMs;
  build = ["apps/cli/src", "packages", "schemas", "scripts/generate-schema-types.mjs", "tsconfig.json"]
    .some((path) => newest(join(root, path)) > compiledAt);
} catch {
  build = true;
}

if (build) {
  const result = spawnSync("pnpm", ["--silent", "build"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);

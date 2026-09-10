import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".js") ? [join(dir, entry.name)] : []); }
for (const file of files("src")) if (spawnSync(process.execPath, ["--check", file], { stdio: "inherit" }).status !== 0) process.exit(1);

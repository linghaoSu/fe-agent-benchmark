import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".js") ? [join(dir, entry.name)] : []); }
if (files("src").some((file) => readFileSync(file, "utf8").includes("console.log"))) process.exit(1);

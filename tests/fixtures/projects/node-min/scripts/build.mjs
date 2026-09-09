import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("dist", { recursive: true }); writeFileSync("dist/index.txt", "built\n");

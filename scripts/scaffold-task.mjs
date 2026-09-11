// Copies the infrastructure files of react-orders-filter-017 into a new task bundle so every MVP task shares the
// same React runtime (installed from the public registry via the pinned lockfile), server and scripts. Authors then fill src/, tests/, README,
// evaluator/hidden/functional.spec.mjs and references/.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id, title, taskType] = process.argv.slice(2);
if (!id || !title || !taskType) { console.error("usage: node scripts/scaffold-task.mjs <task-id> <title> <feature|bugfix|visual|async|accessibility|refactor>"); process.exit(1); }
const source = "datasets/tasks/react-orders-filter-017";
const target = join("datasets/tasks", id);
if (existsSync(target)) { console.error(`${target} exists`); process.exit(1); }
mkdirSync(join(target, "src"), { recursive: true });
for (const file of ["index.html", "server.mjs", "package-lock.json"]) cpSync(join(source, file), join(target, file));
for (const dir of ["scripts"]) cpSync(join(source, dir), join(target, dir), { recursive: true });
const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8")); pkg.name = id;
writeFileSync(join(target, "package.json"), `${JSON.stringify(pkg)}\n`);
let task = readFileSync(join(source, "task.yaml"), "utf8");
task = task.replace(/^id: .*$/m, `id: ${id}`).replace(/^title: .*$/m, `title: ${title}`).replace(/taskType: \w+/, `taskType: ${taskType}`);
writeFileSync(join(target, "task.yaml"), task);
mkdirSync(join(target, "evaluator", "hidden"), { recursive: true });
mkdirSync(join(target, "references", "gold", "src"), { recursive: true });
mkdirSync(join(target, "references", "alternative", "src"), { recursive: true });
mkdirSync(join(target, "references", "mutations"), { recursive: true });
mkdirSync(join(target, "tests"), { recursive: true });
console.log(`scaffolded ${target}`);

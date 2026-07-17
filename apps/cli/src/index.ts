import { resolve } from "node:path";

import { validateTaskFile } from "@frontend-agent-benchmark/contracts";

const [command, taskPath, ...extraArguments] = process.argv.slice(2);

if (command !== "validate" || !taskPath || extraArguments.length > 0) {
  console.log(JSON.stringify({
    valid: false,
    errors: [{
      code: "cli.usage",
      location: "",
      message: "Usage: pnpm eval validate <path-to-task-yaml>",
    }],
  }));
  process.exitCode = 1;
} else {
  const result = validateTaskFile(resolve(process.cwd(), taskPath));
  console.log(JSON.stringify(result));
  process.exitCode = result.valid ? 0 : 1;
}

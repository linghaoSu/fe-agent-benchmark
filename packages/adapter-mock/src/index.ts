import { createInterface } from "node:readline";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ADAPTER_PROTOCOL_VERSION,
  FrameCodec,
  type AdapterFrame,
} from "@frontend-agent-benchmark/adapter-protocol";

const runId = process.env.FAB_RUN_ID;
const attemptId = process.env.FAB_ATTEMPT_ID;
if (!runId || !attemptId) throw new Error("FAB_RUN_ID and FAB_ATTEMPT_ID are required");

const codec = new FrameCodec();
function goldScenario(mutate: (path: string, content: string) => string = (_path, content) => content) {
  const root = process.argv[3];
  if (!root) throw new Error("react-orders-gold requires a gold source directory");
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
  return {
    toolRequests: files(join(root, "src")).map((file, index) => ({
      toolCallId: `react-orders-gold-${index}`,
      tool: "write_file",
      arguments: { path: join("src", relative(join(root, "src"), file)), content: mutate(relative(join(root, "src"), file), readFileSync(file, "utf8")) },
    })),
    patch: "",
  };
}
const scenario = process.argv[2]
  ? ((process.argv[2] === "--docker-workspace" ? {
      toolRequests: [
        { toolCallId: "docker-read-fresh", tool: "read_file", arguments: { path: "src/docker-agent.txt" } },
        {
          toolCallId: "docker-write-allowed",
          tool: "write_file",
          arguments: { path: "src/docker-agent.txt", content: `attempt=${attemptId}\n` },
        },
        { toolCallId: "docker-non-root", tool: "run_command", arguments: { command: "id -u", cwd: "src" } },
        { toolCallId: "docker-protected", tool: "run_command", arguments: { command: "touch protected.txt" } },
      ],
      patch: "",
    } : process.argv[2] === "--docker-residual" ? {
      toolRequests: [{ toolCallId: "docker-residual", tool: "run_command", arguments: { command: "sleep 300 &", cwd: "src" } }],
      patch: "",
    } : process.argv[2] === "--docker-unsafe" ? {
      toolRequests: [{ toolCallId: "docker-unsafe", tool: "run_command", arguments: { command: "ln -s /etc/passwd evil; mkfifo pipe", cwd: "src" } }],
      patch: "",
    } : process.argv[2] === "--build-pass" ? {
      toolRequests: [{ toolCallId: "build-pass", tool: "write_file", arguments: { path: "src/index.mjs", content: "import { createServer } from 'node:http';\nexport const value = 2;\nconst server=createServer((q,s)=>{if(q.url==='/api/health'){s.setHeader('content-type','application/json');return s.end(JSON.stringify({ok:true}));}s.setHeader('content-type','text/html');s.end('<h1 data-testid=\"title\">node-min</h1>');});\nif(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url)server.listen(process.env.PORT||3000);\n" } }], patch: "",
    } : process.argv[2] === "--build-break" ? {
      toolRequests: [{ toolCallId: "build-break", tool: "write_file", arguments: { path: "src/index.mjs", content: "export const value = 0;\n" } }], patch: "",
    } : process.argv[2] === "--functional-break" ? {
      toolRequests: [{ toolCallId: "functional-break", tool: "write_file", arguments: { path: "src/index.mjs", content: "import { createServer } from 'node:http';\nexport const value = 2;\nconst server=createServer((q,s)=>{if(q.url==='/api/health'){s.setHeader('content-type','application/json');return s.end(JSON.stringify({ok:true}));}s.setHeader('content-type','text/html');s.end('<h1 data-testid=\"title\">wrong</h1>');});\nif(process.argv[1]&&new URL(`file://${process.argv[1]}`).href===import.meta.url)server.listen(process.env.PORT||3000);\n" } }], patch: "",
    } : process.argv[2] === "--forbidden-write" ? {
      toolRequests: [{ toolCallId: "forbidden-write", tool: "write_file", arguments: { path: "scripts/check.mjs", content: "process.exit(1);\n" } }], patch: "diff --git a/scripts/check.mjs b/scripts/check.mjs\n--- a/scripts/check.mjs\n+++ b/scripts/check.mjs\n@@ -1 +1 @@\n-process.exit(0);\n+process.exit(1);\n",
    } : process.argv[2] === "--react-orders-gold" ? goldScenario()
    : process.argv[2] === "--react-orders-noop" ? { toolRequests: [], patch: "" }
    // Gold behaviour with a forced horizontal overflow: functional stays green, responsive must fail.
    : process.argv[2] === "--react-orders-mutation-overflow" ? goldScenario((path, content) => (
      path === "app.js" ? content.replace('React.createElement("table", null,', 'React.createElement("table", { style: { minWidth: "2000px" } },') : content
    ))
    : JSON.parse(readFileSync(process.argv[2], "utf8"))) as {
      toolRequests?: Array<{ toolCallId: string; tool: string; arguments: Record<string, unknown> }>;
      reportEnv?: boolean;
      reportCredentialEvent?: boolean;
      stderrPreset?: "fake_credential";
      holdWithHeartbeatsMs?: number;
      patch?: string;
    })
  : undefined;
let seq = 0;
let taskId = "";
let taskVersion = 0;
let seed = 0;
let toolIndex = 0;
let scenarioHeartbeat: NodeJS.Timeout | undefined;

function send(type: AdapterFrame["type"], payload: Record<string, unknown>): void {
  const frame = {
    schemaVersion: 1,
    protocolVersion: ADAPTER_PROTOCOL_VERSION,
    runId,
    attemptId,
    seq,
    type,
    timestamp: new Date(0).toISOString(),
    payload,
  } as AdapterFrame;
  seq += 1;
  process.stdout.write(codec.serialize(frame));
}

send("hello", {
  adapter: { id: "mock", version: "1" },
  capabilities: ["event", "echo", "patch"],
});

function complete(): void {
  if (!scenario) return;
  send("complete", {
    outcome: "completed",
    summary: "Scripted Mock scenario completed",
    patch: scenario.patch ?? "",
  });
}

function nextTool(): void {
  const request = scenario?.toolRequests?.[toolIndex];
  if (!request) {
    complete();
    return;
  }
  toolIndex += 1;
  send("tool_request", request);
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const frame = codec.parse(Buffer.from(line));
  if (frame.type === "task_context") {
    taskId = frame.payload.taskId as string;
    taskVersion = frame.payload.taskVersion as number;
    const extensions = frame.payload.extensions as Record<string, unknown> | undefined;
    seed = typeof extensions?.seed === "number" ? extensions.seed : 0;
    send("ready", {});
    if (scenario) {
      if (scenario.reportEnv) {
        send("event", { name: "mock_env", data: { keys: Object.keys(process.env).sort() } });
      }
      if (scenario.reportCredentialEvent) {
        send("event", {
          name: "mock_credential",
          data: { api_key: "adapter" + "eventsecret123456" },
        });
      }
      if (scenario.stderrPreset === "fake_credential") {
        process.stderr.write("api_key=" + "adapter" + "stderrsecret123456\n");
      }
      if (scenario.holdWithHeartbeatsMs) {
        scenarioHeartbeat = setInterval(() => send("heartbeat", {}), 5);
        setTimeout(() => {
          if (scenarioHeartbeat) clearInterval(scenarioHeartbeat);
          nextTool();
        }, scenario.holdWithHeartbeatsMs);
        return;
      }
      nextTool();
      return;
    }
    send("event", { name: "mock_started", data: { taskId, taskVersion, seed } });
    send("tool_request", {
      toolCallId: "mock-echo-1",
      tool: "echo",
      arguments: { message: `${taskId}@${taskVersion}:${seed}` },
    });
  } else if (frame.type === "tool_result") {
    if (scenario) {
      send("event", {
        name: "mock_tool_result",
        data: {
          status: frame.payload.status,
          errorCode: frame.payload.errorCode,
          output: frame.payload.output,
        },
      });
      nextTool();
      return;
    }
    send("event", { name: "mock_tool_completed", data: { toolCallId: "mock-echo-1" } });
    const patch = [
      "diff --git a/mock-agent.txt b/mock-agent.txt",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/mock-agent.txt",
      "@@ -0,0 +1 @@",
      `+${taskId}@${taskVersion} seed=${seed}`,
      "",
    ].join("\n");
    send("complete", { outcome: "completed", summary: "Mock patch produced", patch });
  } else if (frame.type === "shutdown" || frame.type === "cancel") {
    if (scenarioHeartbeat) clearInterval(scenarioHeartbeat);
    process.exit(0);
  }
});

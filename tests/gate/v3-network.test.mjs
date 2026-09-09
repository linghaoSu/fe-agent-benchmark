import assert from "node:assert/strict";
import { removeTree } from "./_cleanup.mjs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sandboxModule = new URL("../../packages/sandbox-docker/dist/index.js", import.meta.url);
const PINNED_IMAGE = "node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2";
const daemon = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
const unavailable = daemon.error || daemon.status !== 0
  ? `DOCKER_UNAVAILABLE: ${(daemon.error?.message || daemon.stderr || "daemon unreachable").trim()}`
  : false;

test("GATE-V3.2-Docker: internal Attempt network permits only declared mock-api", {
  skip: unavailable,
  timeout: 120_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "frontend-agent-v3-network-"));
  const context = { runId: "run-network", attemptId: `attempt-${Date.now()}`, ordinal: 1, seed: 7 };
  const { DockerSandboxRuntime, DockerCliClient } = await import(sandboxModule);
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "input.js"), "export {};\n");
    const runtime = new DockerSandboxRuntime({
      imageReference: PINNED_IMAGE, bundlePath: root, writablePaths: ["src/**"],
      services: {
        mockApi: {
          image: PINNED_IMAGE, port: 8080,
          command: ["node", "-e", "require('http').createServer((q,s)=>s.end('ok')).listen(8080)"],
        },
      },
    });
    await runtime.start(context);
    assert.equal(await runtime.run("run_command", {
      command: "node -e \"fetch('http://mock-api:8080').then(r=>r.text()).then(console.log)\"",
    }), "ok\n");
    for (const command of [
      "node -e \"fetch('https://1.1.1.1').then(()=>process.exit(1)).catch(()=>process.exit(0))\"",
      "node -e \"fetch('http://172.17.0.1').then(()=>process.exit(1)).catch(()=>process.exit(0))\"",
      "node -e \"require('dns').lookup('example.com', e => process.exit(e ? 0 : 1))\"",
    ]) assert.equal(await runtime.run("run_command", { command }), "");
    const networkId = runtime.agentNetworkId(context);
    assert.ok(networkId);
    await runtime.cleanup(context);
    const networks = await new DockerCliClient().listNetworks(`frontend-agent-benchmark.attempt=${context.attemptId}`);
    assert.deepEqual(networks, []);
  } finally {
    removeTree(root);
  }
});

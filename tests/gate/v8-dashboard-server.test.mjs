import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { handle } from "../../apps/dashboard-server/dist/index.js";

const REPO = new URL("../..", import.meta.url).pathname;
const SOURCE_DB = join(REPO, "runs", "kimi-sweep.sqlite");

/** A private copy of the sweep database plus one Run directory: the server must never touch the originals. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fab-dashboard-"));
  cpSync(SOURCE_DB, join(root, "kimi-sweep.sqlite"));
  const db = new DatabaseSync(join(root, "kimi-sweep.sqlite"), { readOnly: true });
  const runId = db.prepare("SELECT run_id FROM runs WHERE task_id = 'react-form-validation-065' ORDER BY created_at DESC LIMIT 1").get().run_id;
  db.close();
  cpSync(join(REPO, "runs", runId), join(root, runId), { recursive: true });
  return { root, runId };
}

async function withServer(root, fn) {
  const server = createServer((request, response) => handle(root, request, response));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test("GATE-V8.1-001: dashboard API is a read-only view over runs directories", async () => {
  const { root, runId } = fixture();
  try {
    await withServer(root, async (base) => {
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.ok, true);
      assert.deepEqual(health.databases.map((d) => d.path), ["kimi-sweep.sqlite"]);

      const runs = await (await fetch(`${base}/api/runs?task=react-form-validation-065`)).json();
      assert.ok(runs.length >= 1);
      const run = runs.find((r) => r.runId === runId);
      assert.equal(run.model, "rundao/public/kimi-k3");
      assert.equal(run.solved, false);
      assert.equal(typeof run.scores.functional, "number");
      assert.equal(run.budgetProfile, "agent");

      const shown = await (await fetch(`${base}/api/runs/${runId}`)).json();
      assert.equal(shown.summary.runId, runId);
      assert.ok(Object.keys(shown.evaluators).includes("functional"));
      assert.ok(shown.functionalTests.tests.some((t) => t.id === "empty-submit-shows-all-errors" && t.passed === false));
      assert.ok(shown.toolCalls.length > 0);
      assert.ok(shown.events.length > 0);
      assert.ok(shown.result.result_json);

      const patch = await fetch(`${base}/api/runs/${runId}/artifacts/patch.diff`);
      assert.equal(patch.status, 200);
      assert.match(await patch.text(), /^diff --git/m);
      const png = await fetch(`${base}/api/runs/${runId}/artifacts/screenshots/desktop.png.json?format=png`);
      assert.equal(png.headers.get("content-type"), "image/png");
      assert.equal(Buffer.from(await png.arrayBuffer()).subarray(1, 4).toString(), "PNG");
      // Run directories of other Runs are not served through the artifacts route; nor are paths outside the Attempt.
      for (const bad of ["..%2F..%2Finput.json", "..%2F..%2F..%2Fkimi-sweep.sqlite", "does-not-exist.txt"]) {
        assert.equal((await fetch(`${base}/api/runs/${runId}/artifacts/${bad}`)).status, 404, bad);
      }
      assert.equal((await fetch(`${base}/api/runs/nope`)).status, 404);

      const tasks = await (await fetch(`${base}/api/tasks`)).json();
      assert.ok(tasks.find((t) => t.taskId === "react-form-validation-065").byModel["rundao/public/kimi-k3"].runs >= 1);

      const compared = await (await fetch(`${base}/api/compare?task=react-form-validation-065&k=1&config=kimi=rundao/public/kimi-k3`)).json();
      assert.equal(compared.configurations[0].summary.requestedK, 1);
      assert.equal(compared.configurations[0].summary.successAtK, 0);
      assert.equal(compared.configurations[0].comparable, true);
    });
    // Nothing was written: the copied database still has exactly the original tables and no journal appeared.
    assert.deepEqual(new DatabaseSync(join(root, "kimi-sweep.sqlite"), { readOnly: true }).prepare("SELECT COUNT(*) AS n FROM runs").get().n, 11);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

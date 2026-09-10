import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";

const visual = new URL("../../packages/evaluator-visual/dist/index.js", import.meta.url);
const contracts = new URL("../../packages/contracts/dist/index.js", import.meta.url);

// Minimal PNG encoder for synthetic fixtures. Supports RGB (colorType 2) and RGBA (6), 8-bit, with an optional per-row filter type.
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function filterRow(filter, cur, prev, bpp) {
  const out = Buffer.alloc(cur.length);
  for (let x = 0; x < cur.length; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = cur[x];
    let pred = 0;
    if (filter === 1) pred = a; else if (filter === 2) pred = b; else if (filter === 3) pred = (a + b) >> 1;
    else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    out[x] = (v - pred) & 0xff;
  }
  return out;
}
/** pixel(x, y) -> [r,g,b] or [r,g,b,a] */
function encodePng(width, height, pixel, { colorType = 6, filter = 0 } = {}) {
  const bpp = colorType === 6 ? 4 : 3; const stride = width * bpp; const rows = []; let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) { const px = pixel(x, y); for (let ch = 0; ch < bpp; ch++) cur[x * bpp + ch] = px[ch] ?? 255; }
    const f = typeof filter === "function" ? filter(y) : filter;
    rows.push(Buffer.from([f]), filterRow(f, cur, prev, bpp)); prev = cur;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

const red = () => [200, 30, 30, 255]; const blue = () => [30, 30, 200, 255];
const viewports = [{ name: "desktop", width: 8, height: 6 }, { name: "mobile", width: 4, height: 4 }];
function context() { const staged = []; return { runId: "run", attemptId: "attempt", ordinal: 1, snapshotDigest: "sha256:snapshot", assertSnapshot: async () => {}, stageArtifact: ({ relativePath, content, mime }) => { staged.push({ relativePath, content, mime }); return relativePath; }, staged }; }
function shot(viewport, png, extra = {}) { return { viewport: viewport.name, width: viewport.width, height: viewport.height, pngBase64: png.toString("base64"), geometry: [{ testId: "root", x: 0, y: 0, width: viewport.width, height: viewport.height, top: 0, left: 0, right: viewport.width, bottom: viewport.height }], ...extra }; }
const runWith = (shots) => async () => ({ exitCode: 0, stdout: JSON.stringify({ shots }) + "\n", stderr: "" });
async function validate(result) { const { validateContractDocument } = await import(contracts); const v = validateContractDocument(result, "evaluator-result"); assert.equal(v.valid, true, JSON.stringify(v)); }

test("GATE-V5-VISUAL-001: PNG decoder handles RGB/RGBA and all filter types", async () => {
  const { decodePng } = await import(visual);
  const grad = (x, y) => [x * 30, y * 40, (x + y) * 10, 255];
  for (const colorType of [2, 6]) for (const filter of [0, 1, 2, 3, 4, (y) => y % 5]) {
    const decoded = decodePng(encodePng(8, 6, grad, { colorType, filter }));
    assert.equal(decoded.width, 8); assert.equal(decoded.height, 6);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { const o = (y * 8 + x) * 4; const [r, g, b] = grad(x, y); assert.deepEqual([...decoded.rgba.subarray(o, o + 4)], [r, g, b, 255], `ct=${colorType} f=${filter} px=${x},${y}`); }
  }
  assert.throws(() => decodePng(Buffer.from("not a png")), /signature/);
  const pal = encodePng(2, 2, red); pal[25] = 3; // colour type 3 (palette) -> rejected gracefully
  assert.throws(() => decodePng(pal), /colour type/);
});

test("GATE-V5-VISUAL-002: identical screenshots score 1 and pass", async () => {
  const { VisualEvaluator, compareImages, decodePng } = await import(visual);
  const pngs = viewports.map((vp) => encodePng(vp.width, vp.height, red)); const ctx = context();
  assert.equal(compareImages(decodePng(pngs[0]), decodePng(pngs[0]), 0.05).mismatch, 0);
  const result = await new VisualEvaluator({ port: 3000, viewports, baselines: { desktop: pngs[0], mobile: pngs[1] }, run: runWith(viewports.map((vp, i) => shot(vp, pngs[i]))) }).execute(ctx);
  await validate(result);
  assert.equal(result.status, "passed"); assert.equal(result.outcome.privateCode, "VISUAL_PASSED"); assert.equal(result.outcome.score, 1);
  assert.deepEqual([...result.evidenceRefs].sort(), ["screenshots/desktop.png.json", "screenshots/mobile.png.json", "visual/desktop.diff.json", "visual/desktop.geometry.json", "visual/mobile.diff.json", "visual/mobile.geometry.json", "visual/playwright.log"]);
  for (const s of ctx.staged) assert.match(s.mime, /^(text\/|application\/json$)/);
  const screenshot = JSON.parse(ctx.staged.find((s) => s.relativePath === "screenshots/desktop.png.json").content);
  assert.equal(screenshot.encoding, "base64-png"); assert.equal(screenshot.width, 8); assert.equal(screenshot.height, 6); assert.match(screenshot.sha256, /^sha256:[0-9a-f]{64}$/); assert.equal(screenshot.pngBase64, pngs[0].toString("base64"));
  const diff = JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/desktop.diff.json").content);
  assert.equal(diff.compared, true); assert.equal(diff.mismatch, 0); assert.equal(diff.score, 1); assert.match(diff.baselineSha256, /^sha256:/);
  assert.equal(JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/mobile.geometry.json").content).elements[0].testId, "root");
  const log = ctx.staged.find((s) => s.relativePath === "visual/playwright.log"); assert.equal(log.mime, "text/plain"); assert.equal(log.content.includes(pngs[0].toString("base64")), false); assert.match(log.content, /<stripped>/);
});

test("GATE-V5-VISUAL-003: fully different screenshots fail with score 0", async () => {
  const { VisualEvaluator } = await import(visual); const ctx = context();
  const result = await new VisualEvaluator({ port: 3000, viewports, baselines: { desktop: encodePng(8, 6, red), mobile: encodePng(4, 4, red) }, run: runWith(viewports.map((vp) => shot(vp, encodePng(vp.width, vp.height, blue)))) }).execute(ctx);
  await validate(result);
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "VISUAL_MISMATCH"); assert.equal(result.outcome.score, 0);
  assert.equal(JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/desktop.diff.json").content).mismatch, 1);
});

test("GATE-V5-VISUAL-004: partial mismatch scales with threshold and dimension mismatch is 1", async () => {
  const { compareImages, decodePng, VisualEvaluator } = await import(visual);
  // 1 of 48 pixels differs (~2.08%) -> with threshold 0.05 score ~0.583
  const partial = compareImages(decodePng(encodePng(8, 6, (x, y) => (x === 0 && y === 0 ? blue() : red()))), decodePng(encodePng(8, 6, red)), 0.05);
  assert.ok(Math.abs(partial.mismatch - 1 / 48) < 1e-9); assert.ok(Math.abs(partial.score - (1 - 1 / 48 / 0.05)) < 1e-9);
  // small deltas (<= 16) are ignored
  assert.equal(compareImages(decodePng(encodePng(8, 6, () => [200, 30, 30, 255])), decodePng(encodePng(8, 6, () => [216, 14, 46, 255])), 0.05).mismatch, 0);
  const dims = compareImages(decodePng(encodePng(8, 6, red)), decodePng(encodePng(4, 4, red)), 0.05);
  assert.equal(dims.mismatch, 1); assert.equal(dims.score, 0);
  const ctx = context(); const vps = [viewports[0]];
  const result = await new VisualEvaluator({ port: 3000, viewports: vps, baselines: { desktop: encodePng(4, 4, red) }, run: runWith([shot(vps[0], encodePng(8, 6, red))]) }).execute(ctx);
  await validate(result); assert.equal(result.outcome.privateCode, "VISUAL_MISMATCH");
  assert.equal(JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/desktop.diff.json").content).mismatch, 1);
});

test("GATE-V5-VISUAL-005: mixed viewports average only those with baselines", async () => {
  const { VisualEvaluator } = await import(visual); const ctx = context();
  const result = await new VisualEvaluator({ port: 3000, viewports, baselines: { desktop: encodePng(8, 6, red), mobile: undefined }, run: runWith([shot(viewports[0], encodePng(8, 6, red)), shot(viewports[1], encodePng(4, 4, blue))]) }).execute(ctx);
  await validate(result); assert.equal(result.status, "passed"); assert.equal(result.outcome.score, 1);
  const mobile = JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/mobile.diff.json").content); assert.equal(mobile.compared, false); assert.equal(mobile.baselineSha256, undefined);
});

test("GATE-V5-VISUAL-006: no baselines -> skipped VISUAL_BASELINE_MISSING with evidence", async () => {
  const { VisualEvaluator } = await import(visual); const ctx = context();
  const result = await new VisualEvaluator({ port: 3000, viewports, baselines: {}, run: runWith(viewports.map((vp) => shot(vp, encodePng(vp.width, vp.height, red)))) }).execute(ctx);
  await validate(result);
  assert.equal(result.status, "skipped"); assert.equal(result.outcome.privateCode, "VISUAL_BASELINE_MISSING"); assert.equal(result.outcome.passed, false); assert.equal(result.outcome.score, undefined);
  assert.ok(result.evidenceRefs.length > 0); assert.ok(result.evidenceRefs.includes("visual/playwright.log")); assert.ok(result.evidenceRefs.includes("screenshots/desktop.png.json"));
});

test("GATE-V5-VISUAL-007: oversized screenshot is recorded and fails comparison", async () => {
  const { VisualEvaluator } = await import(visual); const ctx = context();
  const result = await new VisualEvaluator({ port: 3000, viewports: [viewports[0]], baselines: { desktop: encodePng(8, 6, red) }, run: runWith([shot(viewports[0], Buffer.alloc(0), { pngBase64: "", oversized: true })]) }).execute(ctx);
  await validate(result);
  assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "VISUAL_MISMATCH"); assert.equal(result.outcome.score, 0); assert.match(result.outcome.summary, /exceeded/);
  const screenshot = JSON.parse(ctx.staged.find((s) => s.relativePath === "screenshots/desktop.png.json").content); assert.equal(screenshot.oversized, true); assert.equal(screenshot.pngBase64, ""); assert.equal(screenshot.sha256, null);
  const diff = JSON.parse(ctx.staged.find((s) => s.relativePath === "visual/desktop.diff.json").content); assert.equal(diff.compared, false); assert.equal(diff.score, 0);
});

test("GATE-V5-VISUAL-008: garbage or failing playwright output yields a valid failed result", async () => {
  const { VisualEvaluator } = await import(visual);
  for (const run of [async () => ({ exitCode: 1, stdout: "", stderr: "boom" }), async () => ({ exitCode: 0, stdout: "not json", stderr: "" })]) {
    const ctx = context(); const result = await new VisualEvaluator({ port: 3000, viewports, baselines: { desktop: encodePng(8, 6, red) }, run }).execute(ctx);
    await validate(result); assert.equal(result.status, "failed"); assert.equal(result.outcome.privateCode, "VISUAL_MISMATCH"); assert.equal(result.outcome.score, 0);
  }
});

test("GATE-V5-VISUAL-009: generated script configures the browser deterministically", async () => {
  const { VisualEvaluator } = await import(visual); let script = "";
  await new VisualEvaluator({ port: 4321, viewports, locale: "de-DE", timezone: "Europe/Berlin", baselines: {}, run: async (s) => { script = s; return { exitCode: 0, stdout: "{\"shots\":[]}", stderr: "" }; } }).execute(context());
  for (const needle of ["require('playwright-core')", "chromium.launch({headless:true})", "http://app:'+cfg.port+'/'", "\"port\":4321", "\"locale\":\"de-DE\"", "\"timezone\":\"Europe/Berlin\"", "deviceScaleFactor:1", "reducedMotion:'reduce'", "waitUntil:'networkidle'", "setDefaultNavigationTimeout(15000)", "setDefaultTimeout(5000)", "animation:none!important;transition:none!important;caret-color:transparent!important", "document.fonts.ready", "fullPage:true,type:'png'", "[data-testid]", "getBoundingClientRect", `"maxBytes":${4 * 1024 * 1024}`]) assert.ok(script.includes(needle), `script missing ${needle}`);
});

test("GATE-V5-VISUAL-010: decoder refuses images above the pixel budget before inflating", async () => {
  const { decodePng } = await import(visual);
  // Craft an IHDR claiming 20000x20000 with a tiny IDAT; the decoder must reject on dimensions, not allocate.
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(20000, 0); ihdr.writeUInt32BE(20000, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", Buffer.from([0x78, 0x9c, 0x03, 0x00])), chunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => decodePng(png), /pixel decode limit/);
});

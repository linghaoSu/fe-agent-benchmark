#!/usr/bin/env node
// Turn Sketch artboards into task design assets: a PNG rendering (via
// sketchtool), a pruned structured spec JSON an agent can implement from, and
// a plain-text dump of the visible strings in reading order for test authors.
//
// Usage:
//   node scripts/sketch-extract.mjs <file.sketch> --artboard "<name>" [--artboard ...] --out <dir> [--scale 1]
//
// Emits per artboard, under <out>/: <slug>.png, <slug>.spec.json, <slug>.texts.txt.
// Artboards are located by exact name through meta.json; zip entries are read
// one at a time with `unzip -p` so the (possibly huge) images/ payload is never
// touched. PNG export shells out to Sketch.app's sketchtool and exports by
// artboard id so names containing '/' cannot turn into nested directories.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKETCHTOOL = '/Applications/Sketch.app/Contents/MacOS/sketchtool';
const SPEC_CAP_BYTES = 200 * 1024;
const MIN_SHAPE_SIZE = 8;
const SHAPE_CLASSES = new Set(['rectangle', 'oval', 'shapePath', 'shapeGroup', 'triangle', 'polygon', 'star']);

function parseArgs(argv) {
  const args = { artboards: [], scale: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artboard') args.artboards.push(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--scale') args.scale = Number(argv[++i]);
    else if (!args.file) args.file = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!args.file || !args.out || args.artboards.length === 0) {
    console.error('usage: sketch-extract.mjs <file.sketch> --artboard "<name>" [--artboard ...] --out <dir> [--scale 1]');
    process.exit(2);
  }
  return args;
}

function readZipEntry(file, entry) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', file, entry]);
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`unzip -p ${entry} exited ${code}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

async function readZipJson(file, entry) {
  return JSON.parse((await readZipEntry(file, entry)).toString('utf8'));
}

function slugify(name) {
  return name
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function hex(color) {
  const c = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  const rgb = `#${c(color.red)}${c(color.green)}${c(color.blue)}`;
  return color.alpha < 1 ? rgb + c(color.alpha) : rgb;
}

function isNeutral(color) {
  if (color.alpha === 0) return true;
  return color.red > 0.97 && color.green > 0.97 && color.blue > 0.97;
}

function solidFill(layer) {
  const fill = (layer.style?.fills ?? []).find((f) => f.isEnabled && f.fillType === 0 && f.color);
  return fill && !isNeutral(fill.color) ? hex(fill.color) : null;
}

// Icon fonts render private-use codepoints; such "text" carries no words.
function stripIconGlyphs(str) {
  return str.replace(/[\uE000-\uF8FF]/g, '');
}

function textInfo(layer) {
  const attr = layer.attributedString?.attributes?.[0]?.attributes ?? layer.style?.textStyle?.encodedAttributes ?? {};
  const font = attr.MSAttributedStringFontAttribute?.attributes;
  const out = { text: layer.attributedString?.string ?? '' };
  if (font?.size) out.fontSize = font.size;
  if (font?.name?.includes('-')) {
    const style = font.name.slice(font.name.indexOf('-') + 1).toLowerCase();
    const weight = { thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 };
    out.weight = weight[style.replace(/italic$/, '')] ?? style;
  }
  if (attr.MSAttributedStringColorAttribute) out.color = hex(attr.MSAttributedStringColorAttribute);
  return out;
}

// Index symbol masters by symbolID: local masters (any page, typically
// "Symbols") plus library masters embedded in document.json foreignSymbols.
class SymbolIndex {
  constructor() {
    this.masters = new Map();
  }
  addMasters(layers) {
    for (const l of layers) {
      if (l._class === 'symbolMaster') this.masters.set(l.symbolID, l);
      if (l.layers) this.addMasters(l.layers);
    }
  }
  addForeign(foreignSymbols) {
    for (const f of foreignSymbols ?? []) {
      if (f.symbolMaster) this.masters.set(f.symbolMaster.symbolID, f.symbolMaster);
    }
  }
  name(symbolID) {
    return this.masters.get(symbolID)?.name;
  }
  // Override names are "<layerID>/<layerID>_<prop>" paths through nested
  // instances; map the path to the target layer's name for readability.
  overrideTarget(symbolID, path) {
    let layers = this.masters.get(symbolID)?.layers;
    let name;
    for (const id of path) {
      const hit = (function find(list) {
        for (const l of list ?? []) {
          if (l.do_objectID === id) return l;
          if (l._class !== 'symbolInstance') {
            const r = find(l.layers);
            if (r) return r;
          }
        }
      })(layers);
      if (!hit) return name ?? id;
      name = hit.name;
      layers = hit._class === 'symbolInstance' ? this.masters.get(hit.symbolID)?.layers : hit.layers;
    }
    return name;
  }
}

// Returns { overrides, strings }: all readable overrides (text and symbol
// swaps, keyed by target layer name) plus just the text values for texts.txt.
function overridesOf(layer, symbols) {
  const out = {};
  const strings = [];
  for (const o of layer.overrideValues ?? []) {
    const m = /^(.*)_(stringValue|symbolID)$/.exec(o.overrideName);
    if (!m || typeof o.value !== 'string' || stripIconGlyphs(o.value).trim() === '') continue;
    const value = m[2] === 'symbolID' ? symbols.name(o.value) : o.value;
    if (!value) continue;
    if (m[2] === 'stringValue') strings.push(value);
    const target = symbols.overrideTarget(layer.symbolID, m[1].split('/'));
    let key = target;
    for (let n = 2; key in out; n++) key = `${target}#${n}`;
    out[key] = value;
  }
  return { overrides: Object.keys(out).length ? out : undefined, strings };
}

function buildTree(artboard, symbols) {
  const stats = { before: 0, after: 0, spec: 0 };
  const texts = [];

  function visit(layer, ox, oy) {
    stats.before++;
    if (layer.isVisible === false) return null;
    const f = layer.frame;
    const x = Math.round(ox + f.x), y = Math.round(oy + f.y);
    const w = Math.round(f.width), h = Math.round(f.height);
    const base = { name: layer.name, x, y, w, h };
    switch (layer._class) {
      case 'text': {
        const info = textInfo(layer);
        if (stripIconGlyphs(info.text).trim() === '') return null;
        texts.push({ x, y, text: info.text });
        return { ...base, type: 'text', ...info };
      }
      case 'symbolInstance': {
        const master = symbols.name(layer.symbolID) ?? layer.name;
        // `Spec / …` masters are designer redlines, cursors and placeholders, not page content.
        if (/^Spec\s*\//.test(master)) { stats.spec += 1; return null; }
        const node = { ...base, type: 'symbol', symbol: master };
        const { overrides, strings } = overridesOf(layer, symbols);
        if (overrides) node.overrides = overrides;
        for (const text of strings) texts.push({ x, y, text });
        return node;
      }
      case 'bitmap':
        return { ...base, type: 'image' };
      case 'group':
      case 'symbolMaster': {
        const children = (layer.layers ?? []).map((c) => visit(c, x, y)).filter(Boolean);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0];
        return { ...base, type: 'group', children };
      }
      default: {
        if (!SHAPE_CLASSES.has(layer._class)) return null;
        const fill = solidFill(layer);
        if (!fill || w <= MIN_SHAPE_SIZE || h <= MIN_SHAPE_SIZE) return null;
        return { ...base, type: 'shape', fill };
      }
    }
  }

  const layers = (artboard.layers ?? []).map((l) => visit(l, 0, 0)).filter(Boolean);
  const count = (nodes) => nodes.reduce((n, node) => n + 1 + (node.children ? count(node.children) : 0), 0);
  stats.after = count(layers);
  return { layers, texts, stats };
}

function walk(nodes, fn) {
  for (const n of nodes) {
    fn(n);
    if (n.children) walk(n.children, fn);
  }
}

function capSpec(spec, log) {
  let json = JSON.stringify(spec);
  if (json.length <= SPEC_CAP_BYTES) return json;
  walk(spec.layers, (n) => delete n.fill);
  json = JSON.stringify(spec);
  log.push('dropped fill colors');
  if (json.length <= SPEC_CAP_BYTES) return json;
  walk(spec.layers, (n) => {
    if (n.type === 'shape') for (const k of ['x', 'y', 'w', 'h']) delete n[k];
  });
  json = JSON.stringify(spec);
  log.push('dropped leaf shape coordinates');
  if (json.length > SPEC_CAP_BYTES) log.push(`still over cap (${json.length} bytes)`);
  return json;
}

function readingOrder(texts) {
  return texts
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => stripIconGlyphs(t.text).replace(/\s*\n\s*/g, ' ').trim())
    .filter((t, i, arr) => t && arr[i - 1] !== t);
}

function exportPngs(file, items, outDir, scale) {
  const tmp = mkdtempSync(join(tmpdir(), 'sketch-extract-'));
  execFileSync(SKETCHTOOL, [
    'export', 'artboards', file,
    `--items=${items.map((i) => i.id).join(',')}`,
    `--output=${tmp}`, '--formats=png', `--scales=${scale}`,
    '--use-id-for-name=YES', '--overwriting=YES',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  const produced = readdirSync(tmp);
  for (const item of items) {
    const name = produced.find((p) => p.startsWith(item.id) && p.endsWith('.png'));
    if (!name) throw new Error(`sketchtool produced no PNG for artboard "${item.name}"`);
    renameSync(join(tmp, name), join(outDir, `${item.slug}.png`));
  }
  rmSync(tmp, { recursive: true, force: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  const meta = await readZipJson(args.file, 'meta.json');
  const items = args.artboards.map((name) => {
    for (const [pageId, page] of Object.entries(meta.pagesAndArtboards)) {
      for (const [id, ab] of Object.entries(page.artboards)) {
        if (ab.name === name) return { name, id, pageId, slug: slugify(name) };
      }
    }
    throw new Error(`artboard not found: "${name}"`);
  });

  const symbols = new SymbolIndex();
  const document = await readZipJson(args.file, 'document.json');
  symbols.addForeign(document.foreignSymbols);
  const pages = new Map();
  const symbolPageIds = Object.entries(meta.pagesAndArtboards)
    .filter(([, p]) => p.name === 'Symbols')
    .map(([id]) => id);
  for (const pageId of new Set([...symbolPageIds, ...items.map((i) => i.pageId)])) {
    const page = await readZipJson(args.file, `pages/${pageId}.json`);
    pages.set(pageId, page);
    symbols.addMasters(page.layers);
  }

  for (const item of items) {
    const artboard = pages.get(item.pageId).layers.find((l) => l.do_objectID === item.id);
    const { layers, texts, stats } = buildTree(artboard, symbols);
    const spec = {
      artboard: { name: item.name, width: Math.round(artboard.frame.width), height: Math.round(artboard.frame.height) },
      layers,
    };
    const dropped = [];
    const json = capSpec(spec, dropped);
    writeFileSync(join(args.out, `${item.slug}.spec.json`), json);
    writeFileSync(join(args.out, `${item.slug}.texts.txt`), readingOrder(texts).join('\n') + '\n');
    console.log(
      `${item.name}: layers ${stats.before} -> ${stats.after} (${stats.spec} Spec/ markers dropped), spec ${json.length} bytes, ${texts.length} texts` +
        (dropped.length ? ` [cap: ${dropped.join('; ')}]` : ''),
    );
  }

  exportPngs(args.file, items, args.out, args.scale);
  for (const item of items) console.log(`${item.name}: png -> ${join(args.out, `${item.slug}.png`)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

#!/usr/bin/env node
// Convert task bundle directories from `environment.network: controlled-proxy`
// to `open`: strip the package-proxy config, drop the vendored tarballs and
// dependency-cache snapshot, and point lockfile `resolved` URLs at npmjs.org.
// Idempotent: re-running on a converted bundle is a no-op.
//
// Usage: node scripts/convert-task-open-network.mjs <task-dir> [<task-dir> ...]
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const PROXY_PREFIX = 'http://package-proxy:8080/';

function convertTaskYaml(path) {
  const before = readFileSync(path, 'utf8');
  const lines = before.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '  network: controlled-proxy') {
      out.push('  network: open');
      continue;
    }
    if (line === '  packageProxy:') {
      while (i + 1 < lines.length && lines[i + 1].startsWith('    ')) i++;
      continue;
    }
    if (line === 'extensions:') {
      const block = [];
      while (i + 1 < lines.length && lines[i + 1].startsWith('  ')) block.push(lines[++i]);
      const kept = block.filter((l) => !l.startsWith('  dependencyCacheSnapshot:'));
      if (kept.length > 0) out.push(line, ...kept);
      continue;
    }
    out.push(line);
  }
  const after = out.join('\n');
  if (after !== before) writeFileSync(path, after);
  return after !== before;
}

function registryUrl(name, version) {
  const bare = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
  return `https://registry.npmjs.org/${name}/-/${bare}-${version}.tgz`;
}

function convertLockfile(path) {
  const before = readFileSync(path, 'utf8');
  const lock = JSON.parse(before);
  if (lock.lockfileVersion !== 3) throw new Error(`${path}: expected lockfileVersion 3, got ${lock.lockfileVersion}`);
  let rewritten = 0;
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith('node_modules/') || typeof entry.resolved !== 'string') continue;
    if (!entry.resolved.startsWith(PROXY_PREFIX)) continue;
    if (!entry.integrity) throw new Error(`${path}: ${key} has no integrity; refusing to rewrite resolved`);
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const expectedFile = `${name.includes('/') ? name.slice(name.indexOf('/') + 1) : name}-${entry.version}.tgz`;
    if (basename(entry.resolved) !== expectedFile) {
      throw new Error(`${path}: ${key} resolved ${entry.resolved} does not match ${expectedFile}`);
    }
    entry.resolved = registryUrl(name, entry.version);
    rewritten++;
  }
  if (rewritten > 0) writeFileSync(path, JSON.stringify(lock) + (before.endsWith('\n') ? '\n' : ''));
  return rewritten;
}

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (visit(p, true) !== false) walk(p, visit);
    } else visit(p, false);
  }
}

function convertTask(dir) {
  const changed = [];
  const removed = [];
  if (convertTaskYaml(join(dir, 'task.yaml'))) changed.push('task.yaml');
  for (const name of ['fixtures', 'dependency-cache-snapshot.json']) {
    const p = join(dir, name);
    if (existsSync(p)) {
      rmSync(p, { recursive: true });
      removed.push(name);
    }
  }
  const lock = join(dir, 'package-lock.json');
  if (existsSync(lock) && convertLockfile(lock) > 0) changed.push('package-lock.json');

  const nested = [];
  const refs = join(dir, 'references');
  if (existsSync(refs)) {
    walk(refs, (p, isDir) => {
      const rel = relative(dir, p);
      if (isDir && basename(p) === 'fixtures') {
        rmSync(p, { recursive: true });
        removed.push(rel);
        nested.push(rel);
        return false;
      }
      if (!isDir && basename(p) === 'package-lock.json' && convertLockfile(p) > 0) {
        changed.push(rel);
        nested.push(rel);
      }
    });
  }

  const summary = [
    changed.length ? `changed ${changed.join(', ')}` : 'no changes',
    removed.length ? `removed ${removed.join(', ')}` : '',
    nested.length ? `NESTED under references: ${nested.join(', ')}` : '',
  ].filter(Boolean).join(' | ');
  console.log(`${basename(dir)}: ${summary}`);
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: convert-task-open-network.mjs <task-dir> [...]');
  process.exit(2);
}
for (const dir of dirs) convertTask(dir);

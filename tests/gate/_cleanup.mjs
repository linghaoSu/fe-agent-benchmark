import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// Frozen submission snapshots are chmod a-w; restore write bits so temp roots can be removed.
export function removeTree(root) {
  const unlock = (path) => {
    let stat;
    try { stat = lstatSync(path); } catch { return; }
    if (stat.isSymbolicLink()) return;
    try { chmodSync(path, stat.mode | 0o700); } catch {}
    if (stat.isDirectory()) for (const name of readdirSync(path)) unlock(join(path, name));
  };
  unlock(root);
  rmSync(root, { recursive: true, force: true });
}

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE tasks (
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  bundle_checksum TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  path TEXT NOT NULL,
  PRIMARY KEY (task_id, version)
);

CREATE TRIGGER tasks_bundle_checksum_immutable
BEFORE UPDATE OF bundle_checksum ON tasks
WHEN NEW.bundle_checksum <> OLD.bundle_checksum
BEGIN
  SELECT RAISE(ABORT, 'task bundle checksum is immutable');
END;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  input_hash TEXT NOT NULL,
  resolved_input_json TEXT NOT NULL,
  input_json_checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  task_id TEXT NOT NULL,
  task_version INTEGER NOT NULL,
  bundle_checksum TEXT NOT NULL,
  seed_set TEXT NOT NULL,
  budgets_json TEXT NOT NULL,
  dependency_lock_hash TEXT,
  dependency_cache_snapshot_id TEXT,
  FOREIGN KEY (task_id, task_version) REFERENCES tasks (task_id, version)
);

CREATE INDEX runs_comparison_dimensions_idx ON runs (
  task_id,
  task_version,
  bundle_checksum,
  seed_set,
  budgets_json,
  dependency_lock_hash,
  dependency_cache_snapshot_id
);

CREATE TRIGGER runs_resolved_input_immutable
BEFORE UPDATE OF input_hash, resolved_input_json, input_json_checksum ON runs
WHEN NEW.input_hash <> OLD.input_hash
  OR NEW.resolved_input_json <> OLD.resolved_input_json
  OR NEW.input_json_checksum <> OLD.input_json_checksum
BEGIN
  SELECT RAISE(ABORT, 'resolved Run input is immutable');
END;

CREATE TABLE transitions (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (run_id, seq),
  FOREIGN KEY (run_id) REFERENCES runs (run_id)
);

CREATE TRIGGER transitions_append_only_update
BEFORE UPDATE ON transitions
BEGIN
  SELECT RAISE(ABORT, 'Run transitions are append-only');
END;

CREATE TRIGGER transitions_append_only_delete
BEFORE DELETE ON transitions
BEGIN
  SELECT RAISE(ABORT, 'Run transitions are append-only');
END;

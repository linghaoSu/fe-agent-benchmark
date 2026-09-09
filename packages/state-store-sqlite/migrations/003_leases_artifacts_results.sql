CREATE TABLE execution_leases (
  lease_name TEXT PRIMARY KEY,
  owner_uuid TEXT NOT NULL,
  owner_pid INTEGER NOT NULL,
  owner_pid_started_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE artifacts (
  attempt_id TEXT NOT NULL,
  logical_type TEXT NOT NULL,
  mime TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  status TEXT NOT NULL CHECK (status IN ('staged', 'finalized')),
  audience TEXT NOT NULL CHECK (audience IN ('maintainer_only', 'requester_safe')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, relative_path),
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE TABLE manifests (
  attempt_id TEXT PRIMARY KEY,
  manifest_checksum TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE TABLE results (
  run_id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (run_id)
);

CREATE INDEX artifacts_attempt_idx ON artifacts (attempt_id);

CREATE TRIGGER artifacts_append_only_update
BEFORE UPDATE ON artifacts
BEGIN
  SELECT RAISE(ABORT, 'Artifacts are immutable after recording');
END;

CREATE TRIGGER artifacts_append_only_delete
BEFORE DELETE ON artifacts
BEGIN
  SELECT RAISE(ABORT, 'Artifacts are immutable after recording');
END;

CREATE TRIGGER manifests_append_only_update
BEFORE UPDATE ON manifests
BEGIN
  SELECT RAISE(ABORT, 'Manifests are immutable after finalization');
END;

CREATE TRIGGER manifests_append_only_delete
BEFORE DELETE ON manifests
BEGIN
  SELECT RAISE(ABORT, 'Manifests are immutable after finalization');
END;

CREATE TRIGGER results_append_only_update
BEFORE UPDATE ON results
BEGIN
  SELECT RAISE(ABORT, 'Canonical Results are immutable');
END;

CREATE TRIGGER results_append_only_delete
BEFORE DELETE ON results
BEGIN
  SELECT RAISE(ABORT, 'Canonical Results are immutable');
END;

CREATE TRIGGER runs_completed_requires_final_records
BEFORE UPDATE OF status ON runs
WHEN NEW.status = 'COMPLETED' AND (
  NOT EXISTS (SELECT 1 FROM results WHERE run_id = NEW.run_id)
  OR EXISTS (
    SELECT 1 FROM attempts
    WHERE attempts.run_id = NEW.run_id
      AND attempts.lifecycle_status = 'SUCCEEDED'
      AND NOT EXISTS (
        SELECT 1 FROM manifests WHERE manifests.attempt_id = attempts.attempt_id
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Completed Run requires canonical Result and finalized manifests');
END;

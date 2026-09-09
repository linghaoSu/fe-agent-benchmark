CREATE TABLE exports (
  export_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience = 'requester'),
  public_result_checksum TEXT,
  manifest_hash TEXT,
  public_code_policy_version INTEGER NOT NULL,
  policy_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'EXPORT_POLICY_DENIED')),
  failure_code TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (run_id),
  CHECK (
    (outcome = 'passed'
      AND public_result_checksum IS NOT NULL
      AND manifest_hash IS NOT NULL
      AND failure_code IS NULL)
    OR
    (outcome = 'EXPORT_POLICY_DENIED'
      AND public_result_checksum IS NULL
      AND manifest_hash IS NULL
      AND failure_code IS NOT NULL)
  )
);

CREATE INDEX exports_run_idx ON exports (run_id, created_at);

CREATE TRIGGER exports_append_only_update
BEFORE UPDATE ON exports
BEGIN
  SELECT RAISE(ABORT, 'Export audit records are append-only');
END;

CREATE TRIGGER exports_append_only_delete
BEFORE DELETE ON exports
BEGIN
  SELECT RAISE(ABORT, 'Export audit records are append-only');
END;

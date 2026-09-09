CREATE TABLE tool_calls (
  attempt_id TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  tool TEXT NOT NULL,
  arguments_json TEXT NOT NULL CHECK (json_valid(arguments_json)),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'completed')),
  outcome_code TEXT,
  output_bytes INTEGER NOT NULL DEFAULT 0 CHECK (output_bytes >= 0),
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  artifact_ref TEXT,
  accepted_at TEXT NOT NULL,
  executed_at TEXT,
  PRIMARY KEY (attempt_id, seq),
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE TRIGGER tool_calls_valid_completion
BEFORE UPDATE ON tool_calls
WHEN OLD.status <> 'accepted'
  OR NEW.status <> 'completed'
  OR NEW.attempt_id <> OLD.attempt_id
  OR NEW.seq <> OLD.seq
  OR NEW.tool <> OLD.tool
  OR NEW.arguments_json <> OLD.arguments_json
  OR NEW.accepted_at <> OLD.accepted_at
  OR NEW.outcome_code IS NULL
  OR NEW.executed_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Tool calls allow only accepted-to-completed updates');
END;

CREATE TRIGGER tool_calls_no_delete
BEFORE DELETE ON tool_calls
BEGIN
  SELECT RAISE(ABORT, 'Tool calls cannot be deleted');
END;

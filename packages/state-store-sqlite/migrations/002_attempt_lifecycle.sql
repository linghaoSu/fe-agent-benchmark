ALTER TABLE transitions RENAME TO run_transitions;

DROP TRIGGER transitions_append_only_update;
DROP TRIGGER transitions_append_only_delete;

CREATE TRIGGER run_transitions_append_only_update
BEFORE UPDATE ON run_transitions
BEGIN
  SELECT RAISE(ABORT, 'Run transitions are append-only');
END;

CREATE TRIGGER run_transitions_append_only_delete
BEFORE DELETE ON run_transitions
BEGIN
  SELECT RAISE(ABORT, 'Run transitions are append-only');
END;

CREATE TABLE attempts (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 2),
  seed INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN (
    'CREATED',
    'SANDBOX_STARTING',
    'AGENT_RUNNING',
    'AGENT_STOPPING',
    'WORKSPACE_FROZEN',
    'EVALUATING',
    'FINALIZING',
    'FAILED',
    'SUCCEEDED'
  )),
  agent_outcome TEXT NOT NULL CHECK (agent_outcome IN (
    'not_started',
    'completed',
    'adapter_error',
    'model_error',
    'budget_exhausted',
    'cancelled'
  )),
  termination_cause TEXT,
  termination_phase TEXT CHECK (termination_phase IN ('sandbox_starting', 'agent', 'evaluation')),
  execution_classification TEXT CHECK (execution_classification IN (
    'completed',
    'agent_failure',
    'budget_exhausted',
    'invalid',
    'infrastructure_error',
    'evaluator_error'
  )),
  failure_code TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (run_id, ordinal),
  FOREIGN KEY (run_id) REFERENCES runs (run_id)
);

CREATE TRIGGER attempts_agent_outcome_immutable
BEFORE UPDATE OF agent_outcome ON attempts
WHEN OLD.agent_outcome <> 'not_started' AND NEW.agent_outcome <> OLD.agent_outcome
BEGIN
  SELECT RAISE(ABORT, 'Agent outcome is immutable');
END;

CREATE TABLE transitions (
  attempt_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, seq),
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE TRIGGER attempt_transitions_append_only_update
BEFORE UPDATE ON transitions
BEGIN
  SELECT RAISE(ABORT, 'Attempt transitions are append-only');
END;

CREATE TRIGGER attempt_transitions_append_only_delete
BEFORE DELETE ON transitions
BEGIN
  SELECT RAISE(ABORT, 'Attempt transitions are append-only');
END;

CREATE TABLE producer_records (
  producer_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('evaluator', 'policy', 'adapter', 'budget', 'infrastructure')),
  phase TEXT NOT NULL,
  private_code TEXT NOT NULL,
  bounded_summary TEXT NOT NULL CHECK (length(bounded_summary) BETWEEN 1 AND 500),
  artifact_refs_json TEXT NOT NULL CHECK (json_valid(artifact_refs_json)),
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE INDEX producer_records_attempt_idx ON producer_records (attempt_id);

CREATE TABLE adapter_frames (
  attempt_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN (
    'adapter_to_coordinator',
    'coordinator_to_adapter'
  )),
  seq INTEGER NOT NULL CHECK (seq >= 0),
  type TEXT NOT NULL,
  frame_json TEXT NOT NULL CHECK (json_valid(frame_json)),
  received_at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, direction, seq),
  FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id)
);

CREATE TRIGGER adapter_frames_append_only_update
BEFORE UPDATE ON adapter_frames
BEGIN
  SELECT RAISE(ABORT, 'Adapter frames are append-only');
END;

CREATE TRIGGER adapter_frames_append_only_delete
BEFORE DELETE ON adapter_frames
BEGIN
  SELECT RAISE(ABORT, 'Adapter frames are append-only');
END;

ALTER TABLE attempts ADD COLUMN submission_snapshot_digest TEXT;

CREATE TRIGGER attempts_submission_snapshot_digest_immutable
BEFORE UPDATE OF submission_snapshot_digest ON attempts
WHEN OLD.submission_snapshot_digest IS NOT NULL AND NEW.submission_snapshot_digest <> OLD.submission_snapshot_digest
BEGIN
  SELECT RAISE(ABORT, 'Submission snapshot digest is immutable');
END;

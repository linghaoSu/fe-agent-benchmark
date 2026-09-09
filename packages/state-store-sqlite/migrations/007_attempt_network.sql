ALTER TABLE attempts ADD COLUMN agent_network_id TEXT;

CREATE TRIGGER attempts_agent_network_id_immutable
BEFORE UPDATE OF agent_network_id ON attempts
WHEN OLD.agent_network_id IS NOT NULL AND NEW.agent_network_id <> OLD.agent_network_id
BEGIN
  SELECT RAISE(ABORT, 'Attempt network identity is immutable');
END;

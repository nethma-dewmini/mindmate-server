-- Migration: Create group_sessions table for expert scheduling
CREATE TABLE IF NOT EXISTS group_sessions (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  expert_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_time VARCHAR(100) NOT NULL,
  topic TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for optimized queries
CREATE INDEX IF NOT EXISTS idx_group_sessions_expert_id ON group_sessions(expert_id);

-- trigger_set_timestamp trigger to keep updated_at in sync
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_group_sessions_updated_at') THEN
    CREATE TRIGGER trg_group_sessions_updated_at BEFORE UPDATE ON group_sessions FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;

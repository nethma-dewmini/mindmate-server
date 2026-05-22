-- Create mood_entries table
-- Run this in pgAdmin or psql to set up the schema

CREATE TABLE IF NOT EXISTS mood_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  mood smallint NOT NULL CHECK (mood >= 1 AND mood <= 5),
  note text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mood_entries_user_id_created_at ON mood_entries(user_id, created_at DESC);

-- Example queries:
-- List recent entries for a user: SELECT * FROM mood_entries WHERE user_id = '<uid>' ORDER BY created_at DESC LIMIT 50;
-- Summary for last 30 days: SELECT COUNT(*) AS count, AVG(mood) AS avg_mood FROM mood_entries WHERE user_id = '<uid>' AND created_at >= NOW() - INTERVAL '30 days';

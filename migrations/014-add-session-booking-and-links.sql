-- Migration: Add session bookings table and link columns to group_sessions
CREATE TABLE IF NOT EXISTS group_session_bookings (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  booked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, student_id)
);

-- Optimize queries with indexes
CREATE INDEX IF NOT EXISTS idx_group_session_bookings_session_id ON group_session_bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_group_session_bookings_student_id ON group_session_bookings(student_id);

-- Add optional meeting details columns to group_sessions
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS meeting_details TEXT;

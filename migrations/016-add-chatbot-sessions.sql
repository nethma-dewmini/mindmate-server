-- Migration: Create chatbot_sessions and link chatbot_messages to sessions
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user sessions
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_user_id ON chatbot_sessions(user_id);

-- Add session_id to chatbot_messages
ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chatbot_sessions(id) ON DELETE CASCADE;

-- Migrate existing messages to a default session per user
DO $$
DECLARE
  r RECORD;
  new_session_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM chatbot_messages WHERE session_id IS NULL LOOP
    -- Insert a default session for this user
    INSERT INTO chatbot_sessions (user_id, title)
    VALUES (r.user_id, 'Default Chat')
    RETURNING id INTO new_session_id;

    -- Update existing messages to point to this session
    UPDATE chatbot_messages
    SET session_id = new_session_id
    WHERE user_id = r.user_id AND session_id IS NULL;
  END LOOP;
END $$;

-- Set session_id to NOT NULL after data migration
ALTER TABLE chatbot_messages ALTER COLUMN session_id SET NOT NULL;

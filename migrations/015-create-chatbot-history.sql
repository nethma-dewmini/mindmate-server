-- Migration: Create chatbot_messages table for persisting conversation history
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for optimizing queries by user and created_at
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user_id ON chatbot_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at);

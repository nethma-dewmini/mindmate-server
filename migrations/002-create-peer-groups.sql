-- Create peer_groups, group_members, and group_messages tables
-- Run this in pgAdmin or psql to set up the schema

CREATE TABLE IF NOT EXISTS peer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peer_groups_created_at ON peer_groups(created_at DESC);

CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator','admin')),
  joined_at timestamptz DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at ON group_messages(group_id, created_at DESC);

-- Example queries:
-- List groups: SELECT * FROM peer_groups ORDER BY created_at DESC;
-- List messages for a group: SELECT * FROM group_messages WHERE group_id = '<uuid>' ORDER BY created_at DESC LIMIT 50;

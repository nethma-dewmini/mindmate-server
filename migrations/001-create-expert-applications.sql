-- Create expert_applications table
-- Run this in pgAdmin or psql to set up the schema

CREATE TABLE IF NOT EXISTS expert_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text,
  name text NOT NULL,
  email text NOT NULL,
  role_requested text NOT NULL,
  specialization text,
  experience text,
  documents jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_id uuid,
  admin_notes text,
  created_at timestamptz DEFAULT NOW(),
  reviewed_at timestamptz,
  UNIQUE(email, status) -- prevent multiple pending apps from same email
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_expert_applications_status ON expert_applications(status);
CREATE INDEX IF NOT EXISTS idx_expert_applications_email ON expert_applications(email);
CREATE INDEX IF NOT EXISTS idx_expert_applications_created_at ON expert_applications(created_at DESC);

-- Example query to see pending applications:
-- SELECT id, name, email, role_requested, created_at FROM expert_applications WHERE status = 'pending' ORDER BY created_at DESC;

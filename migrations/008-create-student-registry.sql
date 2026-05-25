-- Preloaded registry of valid university students.
-- Populate this table with official records (reg_no, email).

CREATE TABLE IF NOT EXISTS student_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_no text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_registry_registration_no ON student_registry (registration_no);
CREATE INDEX IF NOT EXISTS idx_student_registry_email ON student_registry (email);

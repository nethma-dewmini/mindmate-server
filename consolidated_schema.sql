-- CONSOLIDATED MINDMATE DATABASE SCHEMA
-- Generated on 2026-06-01T04:43:26.203Z

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ==========================================
-- MIGRATION FILE: 001-create-expert-applications.sql
-- ==========================================

-- Create expert_applications table
-- Run this in pgAdmin or psql to set up the schema

CREATE TABLE IF NOT EXISTS expert_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  specialization text,
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


-- ==========================================
-- MIGRATION FILE: 002-create-peer-groups.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 002-create-users-table.sql
-- ==========================================

-- Create UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (if not already created)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(10) NOT NULL CHECK (role IN ('student','expert','admin')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  registration_no TEXT UNIQUE, -- For students only (format: 2250***)
  phone TEXT,
  bio TEXT,
  -- avatar_url removed
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_registration_no ON users (registration_no);

-- Create experts table (linked to users)
CREATE TABLE IF NOT EXISTS experts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization TEXT,
  qualifications TEXT,
  license_number TEXT UNIQUE,
  price_per_session_cents INTEGER,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for experts
CREATE INDEX IF NOT EXISTS idx_experts_user_id ON experts(user_id);
CREATE INDEX IF NOT EXISTS idx_experts_verified_at ON experts(verified_at);


-- ==========================================
-- MIGRATION FILE: 003-create-moods.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 004-create-core-schema.sql
-- ==========================================

-- Core schema migration based on provided SQLs
-- Safe to re-run: uses IF NOT EXISTS and extension checks

-- Ensure UUID support (both extensions if available)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  role VARCHAR(10) NOT NULL CHECK (role IN ('student','expert','admin')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  phone TEXT,
  bio TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  registration_no TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_registration_no ON users (registration_no);

-- EXPERTS
CREATE TABLE IF NOT EXISTS experts (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialization TEXT,
  qualifications TEXT,
  license_number TEXT,
  price_per_session_cents INTEGER,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experts_user_id ON experts (user_id);

-- APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  student_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expert_id UUID REFERENCES experts(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','canceled','completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_student_id ON appointments (student_id);
CREATE INDEX IF NOT EXISTS idx_appointments_expert_id ON appointments (expert_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments (start_time);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'LKR',
  provider VARCHAR(50),
  provider_transaction_id TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_provider_tx ON payments (provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments (appointment_id);

-- RESOURCES + TAGS
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  title TEXT NOT NULL,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(20) CHECK (type IN ('ARTICLE','VIDEO','GUIDE','AUDIO')),
  category TEXT,
  content_url TEXT,
  summary TEXT,
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public','private','unlisted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_type_category ON resources (type, category);

CREATE TABLE IF NOT EXISTS resource_tags (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_tags_resource_id ON resource_tags (resource_id);

-- PEER GROUPS + MEMBERS
CREATE TABLE IF NOT EXISTS peer_groups (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  name TEXT NOT NULL,
  description TEXT,
  is_moderated BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  group_id UUID REFERENCES peer_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member','moderator','owner')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);

-- MODERATION LOGS
CREATE TABLE IF NOT EXISTS moderation_logs (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  action VARCHAR(50) NOT NULL CHECK (action IN ('flag','remove','warn','ban','approve')),
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actor ON moderation_logs (actor_id);

-- AVAILABILITY SLOTS
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  expert_id UUID REFERENCES experts(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_expert ON availability_slots (expert_id, start_time);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);

-- ASSESSMENTS
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ASSESSMENT RESULTS
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  answers JSONB,
  score INTEGER,
  risk_level VARCHAR(50),
  taken_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_user ON assessment_results (user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_taken ON assessment_results (taken_at);

-- MOODS
CREATE TABLE IF NOT EXISTS mood_entries (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  note TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mood_entries_user_id ON mood_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_mood_entries_created_at ON mood_entries (created_at);

CREATE TABLE IF NOT EXISTS mood_aggregates (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  average_mood NUMERIC(3,2),
  notes_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_moodagg_user_date ON mood_aggregates (user_id, date);

-- UPDATED_AT TRIGGER SUPPORT
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS (for tables that have updated_at)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_users_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='experts' AND column_name='updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_experts_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_experts_updated_at BEFORE UPDATE ON experts FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_appointments_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resources' AND column_name='updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_resources_updated_at') THEN
    EXECUTE 'CREATE TRIGGER trg_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
END $$;

-- SAMPLE DATA: insert a few experts + linked users if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'priya.w@mindmate.example') THEN
    WITH u AS (
      INSERT INTO users (role, email, password_hash, name, phone, bio, is_verified)
      VALUES ('expert','priya.w@mindmate.example', NULL, 'Dr. Priya Wijesinghe', '+94-77-000-0001', 'PhD Clinical Psychologist specializing in anxiety and stress management.', TRUE)
      RETURNING id
    )
    INSERT INTO experts (user_id, specialization, qualifications, license_number, price_per_session_cents, rating_avg, verified_at)
    SELECT id, 'Anxiety & Stress Management', 'Ph.D. in Clinical Psychology, University of Colombo', 'LIC-PRIYA-001', 3500 * 100, 4.9, now() FROM u;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'kasun.f@mindmate.example') THEN
    WITH u AS (
      INSERT INTO users (role, email, password_hash, name, phone, bio, is_verified)
      VALUES ('expert','kasun.f@mindmate.example', NULL, 'Dr. Kasun Fernando', '+94-77-000-0002', 'Psychiatrist focusing on depression and mood disorders.', TRUE)
      RETURNING id
    )
    INSERT INTO experts (user_id, specialization, qualifications, license_number, price_per_session_cents, rating_avg, verified_at)
    SELECT id, 'Depression & Mood Disorders', 'MBBS, MD (Psychiatry)', 'LIC-KASUN-002', 4000 * 100, 4.8, now() FROM u;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'amaya.p@mindmate.example') THEN
    WITH u AS (
      INSERT INTO users (role, email, password_hash, name, phone, bio, is_verified)
      VALUES ('expert','amaya.p@mindmate.example', NULL, 'Dr. Amaya Perera', '+94-77-000-0003', 'Counseling psychologist specialising in relationships and social issues.', TRUE)
      RETURNING id
    )
    INSERT INTO experts (user_id, specialization, qualifications, license_number, price_per_session_cents, rating_avg, verified_at)
    SELECT id, 'Relationship & Social Issues', 'M.Sc. in Counseling Psychology', 'LIC-AMAYA-003', 3000 * 100, 4.7, now() FROM u;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'ranil.s@mindmate.example') THEN
    WITH u AS (
      INSERT INTO users (role, email, password_hash, name, phone, bio, is_verified)
      VALUES ('expert','ranil.s@mindmate.example', NULL, 'Dr. Ranil Silva', '+94-77-000-0004', 'Educational psychologist focusing on academic performance and motivation.', TRUE)
      RETURNING id
    )
    INSERT INTO experts (user_id, specialization, qualifications, license_number, price_per_session_cents, rating_avg, verified_at)
    SELECT id, 'Academic Performance & Motivation', 'Ph.D. in Educational Psychology', 'LIC-RANIL-004', 3500 * 100, 4.9, now() FROM u;
  END IF;
END $$;


-- ==========================================
-- MIGRATION FILE: 005-rename-users-to-unistudents.sql
-- ==========================================

-- Rename table `users` to `unistudents` (safe, idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unistudents') THEN
    ALTER TABLE users RENAME TO unistudents;
  END IF;
END$$;

-- Rename common indexes if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_users_email') THEN
    EXECUTE 'ALTER INDEX idx_users_email RENAME TO idx_unistudents_email';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_users_registration_no') THEN
    EXECUTE 'ALTER INDEX idx_users_registration_no RENAME TO idx_unistudents_registration_no';
  END IF;
END$$;

-- Rename updated_at trigger name if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    EXECUTE 'ALTER TRIGGER trg_users_updated_at ON unistudents RENAME TO trg_unistudents_updated_at';
  END IF;
END$$;


-- ==========================================
-- MIGRATION FILE: 006-drop-avatar-url.sql
-- ==========================================

-- Drop avatar_url column from unistudents (if it exists).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='unistudents' AND column_name='avatar_url') THEN
    EXECUTE 'ALTER TABLE unistudents DROP COLUMN avatar_url';
  END IF;
  -- Also try on users in case rename not applied
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url') THEN
    EXECUTE 'ALTER TABLE users DROP COLUMN avatar_url';
  END IF;
END $$;


-- ==========================================
-- MIGRATION FILE: 007-add-email-verification.sql
-- ==========================================

-- Add email verification fields to unistudents
ALTER TABLE unistudents
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_code_hash text,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_unistudents_email_verified_at ON unistudents (email_verified_at);

-- Preserve access for existing student accounts created before this flow.
UPDATE unistudents
SET email_verified_at = COALESCE(email_verified_at, NOW())
WHERE role = 'student';


-- ==========================================
-- MIGRATION FILE: 008-create-student-registry.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 009-drop-student-registry-name.sql
-- ==========================================

-- Remove name from student_registry for a simpler whitelist model.

ALTER TABLE IF EXISTS student_registry
  DROP COLUMN IF EXISTS name;

-- ==========================================
-- MIGRATION FILE: 010-create-password-resets.sql
-- ==========================================

-- Create table to store password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES unistudents(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT FALSE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);


-- ==========================================
-- MIGRATION FILE: 011-add-title-to-experts-and-apps.sql
-- ==========================================

-- Add title column to expert_applications and experts
ALTER TABLE IF EXISTS expert_applications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE IF EXISTS experts ADD COLUMN IF NOT EXISTS title TEXT;

-- Optional: create index for fast queries by title
CREATE INDEX IF NOT EXISTS idx_expert_applications_title ON expert_applications(title);
CREATE INDEX IF NOT EXISTS idx_experts_title ON experts(title);


-- ==========================================
-- MIGRATION FILE: 012-add-assessment-author-visibility.sql
-- ==========================================

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS key TEXT;

UPDATE assessments
SET key = COALESCE(key, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8))
WHERE key IS NULL OR key = '';

ALTER TABLE assessments
  ALTER COLUMN key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_key ON assessments (key);

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🧠';

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 5;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO assessments (key, title, description, icon, duration, visibility, questions)
VALUES
  (
    'stress',
    'Stress Level Assessment',
    'Evaluate your current stress load, common triggers, and how much it is affecting your routine.',
    '😰',
    6,
    'public',
    $$[{"prompt":"How often have deadlines or workload felt overwhelming recently?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How much tension do you feel in your body during a typical day?","options":["None","A little","Moderate","A lot","Extreme"]},{"prompt":"How easy is it for you to switch off from academic or personal worries?","options":["Very easy","Easy","Mixed","Hard","Very hard"]},{"prompt":"How often do you feel your energy is drained by stress?","options":["Never","Rarely","Sometimes","Often","Always"]},{"prompt":"How confident do you feel in managing pressure right now?","options":["Very confident","Confident","Somewhat","Not much","Not at all"]}]$$::jsonb
  ),
  (
    'anxiety',
    'Anxiety Screening',
    'Check for recurring worry, nervousness, and body symptoms linked with anxiety.',
    '😟',
    7,
    'public',
    $$[{"prompt":"How often have you felt nervous or on edge in the last two weeks?","options":["Never","Several days","More than half the days","Nearly every day","Constantly"]},{"prompt":"How often do you struggle to stop worrying once it starts?","options":["Never","Rarely","Sometimes","Often","Always"]},{"prompt":"How much has anxiety affected your concentration?","options":["Not at all","A little","Moderately","A lot","Severely"]},{"prompt":"How often do you notice physical symptoms like a racing heart or restlessness?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How much does fear of future events affect your day-to-day mood?","options":["Not at all","A little","Somewhat","Quite a bit","Extremely"]}]$$::jsonb
  ),
  (
    'depression',
    'Depression Screening (PHQ-9 style)',
    'Review mood, interest, motivation, and energy patterns associated with low mood.',
    '😔',
    8,
    'public',
    $$[{"prompt":"How often have you had little interest or pleasure in doing things?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you felt down, depressed, or hopeless?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you felt low energy or struggled to get started?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you had trouble sleeping or sleeping too much?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How difficult has it been to handle daily tasks because of your mood?","options":["Not difficult","A little difficult","Moderately difficult","Very difficult","Extremely difficult"]}]$$::jsonb
  ),
  (
    'sleep',
    'Sleep Quality Assessment',
    'Measure sleep duration, sleep quality, and how refreshed you feel during the day.',
    '😴',
    5,
    'public',
    $$[{"prompt":"How would you describe your sleep quality over the last week?","options":["Excellent","Good","Fair","Poor","Very poor"]},{"prompt":"How often do you have trouble falling asleep?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How often do you wake up during the night and struggle to sleep again?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How refreshed do you feel when you wake up?","options":["Very refreshed","Refreshed","Neutral","Tired","Exhausted"]},{"prompt":"How much does poor sleep affect your concentration in the daytime?","options":["Not at all","A little","Somewhat","A lot","Extremely"]}]$$::jsonb
  )
ON CONFLICT (key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  duration = EXCLUDED.duration,
  visibility = EXCLUDED.visibility,
  questions = EXCLUDED.questions,
  updated_at = now();


-- ==========================================
-- MIGRATION FILE: 013-create-group-sessions.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 014-add-session-booking-and-links.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 015-create-chatbot-history.sql
-- ==========================================

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


-- ==========================================
-- MIGRATION FILE: 016-add-chatbot-sessions.sql
-- ==========================================

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


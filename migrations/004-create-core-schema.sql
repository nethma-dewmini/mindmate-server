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
  avatar_url TEXT,
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

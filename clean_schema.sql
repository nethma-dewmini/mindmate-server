-- CLEAN PRODUCTION SCHEMA FOR MINDMATE DATABASE
-- Defines all tables in their final structure with proper UUID types, foreign keys, indexes, triggers, and seed data.

-- Ensure UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. UNISTUDENTS (Main users table)
CREATE TABLE IF NOT EXISTS unistudents (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  role VARCHAR(10) NOT NULL CHECK (role IN ('student','expert','admin')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  phone TEXT,
  bio TEXT,
  registration_no TEXT UNIQUE,
  is_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  email_verification_code_hash TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  email_verification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unistudents_email ON unistudents (email);
CREATE INDEX IF NOT EXISTS idx_unistudents_registration_no ON unistudents (registration_no);
CREATE INDEX IF NOT EXISTS idx_unistudents_email_verified_at ON unistudents (email_verified_at);

-- 2. EXPERTS
CREATE TABLE IF NOT EXISTS experts (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID UNIQUE NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  title TEXT,
  specialization TEXT,
  qualifications TEXT,
  license_number TEXT UNIQUE,
  price_per_session_cents INTEGER,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experts_user_id ON experts (user_id);
CREATE INDEX IF NOT EXISTS idx_experts_verified_at ON experts (verified_at);

-- 3. APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  student_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
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

-- 4. PAYMENTS
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

-- 5. RESOURCES
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  title TEXT NOT NULL,
  author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  type VARCHAR(20) CHECK (type IN ('ARTICLE','VIDEO','GUIDE','AUDIO')),
  category TEXT,
  content_url TEXT,
  summary TEXT,
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public','private','unlisted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_type_category ON resources (type, category);

-- 6. RESOURCE TAGS
CREATE TABLE IF NOT EXISTS resource_tags (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_tags_resource_id ON resource_tags (resource_id);

-- 7. PEER GROUPS
CREATE TABLE IF NOT EXISTS peer_groups (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  name TEXT NOT NULL,
  description TEXT,
  is_moderated BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. GROUP MEMBERS
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  group_id UUID REFERENCES peer_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES unistudents(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('member','moderator','owner')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);

-- 9. GROUP MESSAGES
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  group_id UUID NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at ON group_messages(group_id, created_at DESC);

-- 10. MODERATION LOGS
CREATE TABLE IF NOT EXISTS moderation_logs (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  actor_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  action VARCHAR(50) NOT NULL CHECK (action IN ('flag','remove','warn','ban','approve')),
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actor ON moderation_logs (actor_id);

-- 11. AVAILABILITY SLOTS
CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  expert_id UUID REFERENCES experts(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_expert ON availability_slots (expert_id, start_time);

-- 12. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  actor_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);

-- 13. ASSESSMENTS
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB,
  author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  icon TEXT NOT NULL DEFAULT '🧠',
  duration INTEGER NOT NULL DEFAULT 5,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_key ON assessments (key);

-- 14. ASSESSMENT RESULTS
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  user_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  answers JSONB,
  score INTEGER,
  risk_level VARCHAR(50),
  taken_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_user ON assessment_results (user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_taken ON assessment_results (taken_at);

-- 15. MOOD ENTRIES
CREATE TABLE IF NOT EXISTS mood_entries (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  note TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mood_entries_user_id ON mood_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_mood_entries_created_at ON mood_entries (created_at);

-- 16. MOOD AGGREGATES
CREATE TABLE IF NOT EXISTS mood_aggregates (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID REFERENCES unistudents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  average_mood NUMERIC(3,2),
  notes_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_moodagg_user_date ON mood_aggregates (user_id, date);

-- 17. EXPERT APPLICATIONS
CREATE TABLE IF NOT EXISTS expert_applications (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  specialization TEXT,
  title TEXT,
  documents JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(email, status)
);

CREATE INDEX IF NOT EXISTS idx_expert_applications_status ON expert_applications(status);
CREATE INDEX IF NOT EXISTS idx_expert_applications_email ON expert_applications(email);
CREATE INDEX IF NOT EXISTS idx_expert_applications_created_at ON expert_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_applications_title ON expert_applications(title);

-- 18. STUDENT REGISTRY (University Whitelist)
CREATE TABLE IF NOT EXISTS student_registry (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  registration_no TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_registry_registration_no ON student_registry (registration_no);
CREATE INDEX IF NOT EXISTS idx_student_registry_email ON student_registry (email);

-- 19. PASSWORD RESETS
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID REFERENCES unistudents(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- 20. GROUP SESSIONS
CREATE TABLE IF NOT EXISTS group_sessions (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  expert_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_time VARCHAR(100) NOT NULL,
  topic TEXT NOT NULL,
  content TEXT,
  meeting_link TEXT,
  meeting_details TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_sessions_expert_id ON group_sessions(expert_id);

-- 21. GROUP SESSION BOOKINGS
CREATE TABLE IF NOT EXISTS group_session_bookings (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  booked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_group_session_bookings_session_id ON group_session_bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_group_session_bookings_student_id ON group_session_bookings(student_id);

-- 22. CHATBOT SESSIONS
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_user_id ON chatbot_sessions(user_id);

-- 23. CHATBOT MESSAGES
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
  user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user_id ON chatbot_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at);


-- ===================================================
-- DATABASE TRIGGERS
-- ===================================================

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_unistudents_updated_at') THEN
    CREATE TRIGGER trg_unistudents_updated_at BEFORE UPDATE ON unistudents FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_experts_updated_at') THEN
    CREATE TRIGGER trg_experts_updated_at BEFORE UPDATE ON experts FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_appointments_updated_at') THEN
    CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_resources_updated_at') THEN
    CREATE TRIGGER trg_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_student_registry_updated_at') THEN
    CREATE TRIGGER trg_student_registry_updated_at BEFORE UPDATE ON student_registry FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_group_sessions_updated_at') THEN
    CREATE TRIGGER trg_group_sessions_updated_at BEFORE UPDATE ON group_sessions FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END $$;


-- ===================================================
-- SEED DATA
-- ===================================================

-- Initial Assessments

INSERT INTO assessments (key, title, description, icon, duration, visibility, questions)
VALUES
  (
    'stress',
    'Stress Level Assessment',
    'Evaluate your current stress load, common triggers, and how much it is affecting your routine.',
    '😰',
    6,
    'public',
    $$[{"prompt":"How often have deadlines or workload felt overwhelming recently?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How tension do you feel in your body during a typical day?","options":["None","A little","Moderate","A lot","Extreme"]},{"prompt":"How easy is it for you to switch off from academic or personal worries?","options":["Very easy","Easy","Mixed","Hard","Very hard"]},{"prompt":"How often do you feel your energy is drained by stress?","options":["Never","Rarely","Sometimes","Often","Always"]},{"prompt":"How confident do you feel in managing pressure right now?","options":["Very confident","Confident","Somewhat","Not much","Not at all"]}]$$::jsonb
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

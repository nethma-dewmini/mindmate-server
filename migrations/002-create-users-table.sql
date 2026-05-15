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
  avatar_url TEXT, -- Profile picture URL
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

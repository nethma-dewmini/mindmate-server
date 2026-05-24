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

-- Add title column to expert_applications and experts
ALTER TABLE IF EXISTS expert_applications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE IF EXISTS experts ADD COLUMN IF NOT EXISTS title TEXT;

-- Optional: create index for fast queries by title
CREATE INDEX IF NOT EXISTS idx_expert_applications_title ON expert_applications(title);
CREATE INDEX IF NOT EXISTS idx_experts_title ON experts(title);

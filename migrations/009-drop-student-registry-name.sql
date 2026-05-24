-- Remove name from student_registry for a simpler whitelist model.

ALTER TABLE IF EXISTS student_registry
  DROP COLUMN IF EXISTS name;
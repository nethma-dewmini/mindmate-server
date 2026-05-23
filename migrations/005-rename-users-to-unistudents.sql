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

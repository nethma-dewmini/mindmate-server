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

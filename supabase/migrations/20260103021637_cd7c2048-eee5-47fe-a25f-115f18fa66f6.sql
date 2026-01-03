-- Migration to secure google_tokens table
-- 1. Delete any orphan tokens that don't have a user_id
DELETE FROM google_tokens WHERE user_id IS NULL;

-- 2. Make user_id NOT NULL to enforce authentication requirement
ALTER TABLE google_tokens ALTER COLUMN user_id SET NOT NULL;

-- 3. Drop the session_id column since we now use user_id
ALTER TABLE google_tokens DROP COLUMN IF EXISTS session_id;

-- 4. Add unique constraint on user_id + service to prevent duplicates
DROP INDEX IF EXISTS idx_google_tokens_session_service;
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_tokens_user_service ON google_tokens(user_id, service);

-- 5. Add foreign key reference to auth.users for data integrity
ALTER TABLE google_tokens 
  DROP CONSTRAINT IF EXISTS google_tokens_user_id_fkey,
  ADD CONSTRAINT google_tokens_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
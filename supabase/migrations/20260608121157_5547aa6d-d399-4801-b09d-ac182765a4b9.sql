ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_connection_id text,
  ADD COLUMN IF NOT EXISTS google_email text,
  ADD COLUMN IF NOT EXISTS google_name text;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS google_provider_token;
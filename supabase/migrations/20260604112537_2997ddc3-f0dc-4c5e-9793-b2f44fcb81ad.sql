ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_provider_token text;
ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET DEFAULT true;
UPDATE public.profiles SET onboarding_completed = true WHERE onboarding_completed = false;
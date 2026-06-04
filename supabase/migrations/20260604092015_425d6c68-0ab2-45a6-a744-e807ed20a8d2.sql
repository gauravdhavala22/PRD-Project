ALTER TABLE public.decisions
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Uncategorized';

CREATE INDEX IF NOT EXISTS decisions_category_idx ON public.decisions(category);
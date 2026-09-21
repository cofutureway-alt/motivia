-- Add multi-stage and multi-subject array columns to books and courses tables
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS stage_ids UUID[] DEFAULT '{}';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS subject_ids UUID[] DEFAULT '{}';

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS stage_ids UUID[] DEFAULT '{}';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS subject_ids UUID[] DEFAULT '{}';


CREATE TABLE public.lesson_watch_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  watched_seconds NUMERIC NOT NULL DEFAULT 0,
  furthest_position_seconds NUMERIC NOT NULL DEFAULT 0,
  last_position_seconds NUMERIC NOT NULL DEFAULT 0,
  watch_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX idx_lwp_user ON public.lesson_watch_progress(user_id);
CREATE INDEX idx_lwp_lesson ON public.lesson_watch_progress(lesson_id);
CREATE INDEX idx_lwp_course ON public.lesson_watch_progress(course_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_watch_progress TO authenticated;
GRANT ALL ON public.lesson_watch_progress TO service_role;

ALTER TABLE public.lesson_watch_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own watch progress"
  ON public.lesson_watch_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own watch progress"
  ON public.lesson_watch_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own watch progress"
  ON public.lesson_watch_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own watch progress"
  ON public.lesson_watch_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_lwp_updated_at
  BEFORE UPDATE ON public.lesson_watch_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

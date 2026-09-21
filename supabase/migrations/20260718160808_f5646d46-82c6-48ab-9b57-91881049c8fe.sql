
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  form_number integer NOT NULL CHECK (form_number >= 1),
  type text NOT NULL CHECK (type IN ('single_choice','multiple_choice','true_false','fill_blank')),
  content jsonb NOT NULL,
  image_url text,
  points numeric NOT NULL CHECK (points > 0),
  model_answer_text text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_questions_quiz_form_idx ON public.quiz_questions(quiz_id, form_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER quiz_questions_set_updated_at
  BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.quiz_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_question_options_question_idx ON public.quiz_question_options(question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_question_options TO authenticated;
GRANT ALL ON public.quiz_question_options TO service_role;

ALTER TABLE public.quiz_question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage quiz question options" ON public.quiz_question_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

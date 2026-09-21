-- Create all storage buckets required by the app (idempotent).
-- Storage policies for these buckets already exist in earlier migrations.
-- testimonial-images is created by phase70_branches_and_testimonials.sql.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('thumbnails',             'thumbnails',             true),
  ('avatars',                'avatars',                true),
  ('quiz-images',            'quiz-images',            true),
  ('card-assets',            'card-assets',            false),
  ('payment-proofs',         'payment-proofs',         false),
  ('lesson-files',           'lesson-files',           false),
  ('assignment-files',       'assignment-files',       false),
  ('assignment-submissions', 'assignment-submissions', false),
  ('book-assets',            'book-assets',            false)
ON CONFLICT (id) DO NOTHING;

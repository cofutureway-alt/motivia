-- Chatbot analytics + admin-configurable rate limits + guest message storage

-- ============================================================================
-- 1) chatbot_settings: site url + rate limits (admin editable)
-- ============================================================================
alter table public.chatbot_settings
  add column if not exists site_url text,
  add column if not exists rate_limit_messages integer not null default 50,
  add column if not exists rate_limit_hours integer not null default 3,
  add column if not exists rate_limit_guest_messages integer not null default 50,
  add column if not exists rate_limit_guest_hours integer not null default 3;

-- ============================================================================
-- 2) chat_messages: allow guest rows (user_id null, ip recorded) + admin read
-- ============================================================================
alter table public.chat_messages alter column user_id drop not null;
alter table public.chat_messages add column if not exists guest_ip text;

drop policy if exists "Admins read all chat messages" on public.chat_messages;
create policy "Admins read all chat messages"
  on public.chat_messages for select
  using (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- 3) chat_usage_log: token/request usage for analytics + DB-backed rate limit
-- ============================================================================
create table if not exists public.chat_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_ip text,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_usage_created on public.chat_usage_log (created_at);
create index if not exists idx_chat_usage_user_created on public.chat_usage_log (user_id, created_at);
create index if not exists idx_chat_usage_guest_created on public.chat_usage_log (guest_ip, created_at);

alter table public.chat_usage_log enable row level security;

drop policy if exists "Admins read chat usage log" on public.chat_usage_log;
create policy "Admins read chat usage log"
  on public.chat_usage_log for select
  using (public.has_role(auth.uid(), 'admin'));
-- No insert/update policies: writes happen only via Edge Functions (service role).

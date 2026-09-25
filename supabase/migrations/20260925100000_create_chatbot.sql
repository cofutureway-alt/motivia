-- Chatbot: settings (secrets, service-role only) + per-user chat history + public enable toggle

-- ============================================================================
-- 1) chatbot_settings — singleton (id = 1). No RLS policies on purpose:
--    clients (anon/authenticated) must never read the api_key.
--    Access happens only inside Edge Functions with the service role key.
--    (Same pattern as whatsapp_secrets / payment_gateway_secrets.)
-- ============================================================================
create table if not exists public.chatbot_settings (
  id integer primary key default 1 check (id = 1),
  provider_name text,
  base_url text,
  api_key text,
  model text,
  updated_at timestamptz not null default now()
);

alter table public.chatbot_settings enable row level security;

-- No policies => denied for anon/authenticated. Only service role bypasses RLS.

insert into public.chatbot_settings (id) values (1)
on conflict (id) do nothing;

-- ============================================================================
-- 2) chat_messages — persisted chat history, one user's own rows only.
--    The user is the only one who can read/delete their own messages.
-- ============================================================================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_user_created
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "Users read own chat messages" on public.chat_messages;
create policy "Users read own chat messages"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own chat messages" on public.chat_messages;
create policy "Users insert own chat messages"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own chat messages" on public.chat_messages;
create policy "Users delete own chat messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- 3) Public on/off switch lives in platform_settings (public read, admin write)
-- ============================================================================
alter table public.platform_settings
  add column if not exists chatbot_enabled boolean not null default false;

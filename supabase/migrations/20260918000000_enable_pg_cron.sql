-- Enable pg_cron extension (required by phase69b_whatsapp_cron.sql)
-- On hosted Supabase, pg_cron MUST be installed in the pg_catalog schema.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

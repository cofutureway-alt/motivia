-- Phase 69b: Schedule WhatsApp Dispatcher via pg_cron
-- Runs every minute, processes up to 50 queued messages per batch

SELECT cron.unschedule('whatsapp_dispatcher_job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_dispatcher_job'
);

SELECT cron.schedule(
  'whatsapp_dispatcher_job',
  '* * * * *',
  $$SELECT public.process_whatsapp_queue_batch(50)$$
);

-- Reservation email notification setup for an existing Supabase project.
-- Run this after your base reservations table already exists.

-- 1. Ensure the networking extension is enabled
create extension if not exists pg_net with schema extensions;

-- 2. Add tracking and lock columns
alter table public.reservations
  add column if not exists notification_received_sent_at timestamptz,
  add column if not exists notification_confirmed_sent_at timestamptz,
  add column if not exists notification_cancelled_sent_at timestamptz,
  add column if not exists notification_received_processing_at timestamptz,
  add column if not exists notification_confirmed_processing_at timestamptz,
  add column if not exists notification_cancelled_processing_at timestamptz,
  add column if not exists notification_last_attempt_at timestamptz,
  add column if not exists notification_last_error text;

-- 3. Create a custom trigger function to call the Edge Function
-- This replaces the built-in Supabase Webhooks schema which might be missing.
create or replace function public.handle_reservation_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://vxbxrkoeioakqrxvbnym.supabase.co/functions/v1/send-reservation-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'YOUR_WEBHOOK_SECRET'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW),
      'old_record', case when TG_OP = 'UPDATE' then row_to_json(OLD) else null end
    )
  );
  return new;
end;
$$;

-- 4. Create the triggers
drop trigger if exists on_reservation_insert on public.reservations;
create trigger on_reservation_insert
  after insert on public.reservations
  for each row execute function public.handle_reservation_notification();

drop trigger if exists on_reservation_status_update on public.reservations;
create trigger on_reservation_status_update
  after update of status on public.reservations
  for each row 
  when (old.status is distinct from new.status)
  execute function public.handle_reservation_notification();

-- 5. Add helpful comments
comment on column public.reservations.notification_received_sent_at is 'Timestamp when the "reservation received" email was sent.';
comment on column public.reservations.notification_confirmed_sent_at is 'Timestamp when the "reservation confirmed" email was sent.';
comment on column public.reservations.notification_cancelled_sent_at is 'Timestamp when the "reservation cancelled" email was sent.';

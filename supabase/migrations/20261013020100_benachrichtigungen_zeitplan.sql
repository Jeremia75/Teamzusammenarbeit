-- Zeitplan für den E-Mail-Versand (nur auf Supabase, wo pg_cron, pg_net und Vault vorhanden sind).
-- Alle 5 Minuten wird die Funktion "benachrichtigungen" aufgerufen. Sie verschickt
-- neue Zuordnungen sofort und ab 7 Uhr (Wien) einmal am Tag die tägliche Mail.
-- Lokal (ohne diese Erweiterungen) passiert hier nichts.
do $outer$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise notice 'Zeitplan übersprungen: pg_cron, pg_net oder Vault fehlt';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- Geheimnis, mit dem sich der Zeitplan bei der Funktion ausweist
  if not exists (select 1 from vault.secrets where name = 'notify_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_secret');
  end if;

  execute $f$
    create or replace function public.notify_secret_ok(s text)
    returns boolean language sql stable security definer set search_path = public as $b$
      select exists (select 1 from vault.decrypted_secrets where name = 'notify_secret' and decrypted_secret = s and s <> '');
    $b$;
  $f$;
  revoke all on function public.notify_secret_ok(text) from public, anon, authenticated;
  grant execute on function public.notify_secret_ok(text) to service_role;

  execute $f$
    create or replace function private.call_notify_function()
    returns void language plpgsql security definer set search_path = public as $b$
    declare
      secret text;
    begin
      select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_secret';
      perform net.http_post(
        url := 'https://kgojfedgrfezexammwpm.supabase.co/functions/v1/benachrichtigungen',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-projektraum-secret', secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    end $b$;
  $f$;
  revoke all on function private.call_notify_function() from public, anon, authenticated;

  if exists (select 1 from cron.job where jobname = 'projektraum-benachrichtigungen') then
    perform cron.unschedule('projektraum-benachrichtigungen');
  end if;
  perform cron.schedule('projektraum-benachrichtigungen', '*/5 * * * *', 'select private.call_notify_function()');
end
$outer$;

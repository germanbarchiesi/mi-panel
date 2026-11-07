-- Mi Panel · Fase 9 · Supabase Cron llama a la app cada 30 minutos.
-- El código decide si toca preparar el resumen (6:30) o notificar (7:00) en tu zona horaria.
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 0006, y copiar el resultado de la última consulta
-- a la variable CRON_SECRET de Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secreto aleatorio guardado en Vault (no queda en este texto ni en el historial).
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'mi_panel_cron',
  'Secreto de las llamadas de Supabase Cron a Mi Panel'
)
where not exists (select 1 from vault.secrets where name = 'mi_panel_cron');

select cron.schedule(
  'mi-panel-resumen',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://mi-panel-five-olive.vercel.app/api/resumen/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mi_panel_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Copia este valor a CRON_SECRET en Vercel (no lo pegues en ningún chat).
select decrypted_secret as cron_secret from vault.decrypted_secrets where name = 'mi_panel_cron';

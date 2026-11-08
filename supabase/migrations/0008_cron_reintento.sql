-- Mi Panel · Fase 9 · Cron en minutos no redondos y con reintento.
-- Motivo: varias llamadas a :00 y :30 recibieron un 500 de Vercel antes de llegar a la app.
-- Es seguro llamar de más: el código solo prepara/notifica una vez por día.

select cron.unschedule('mi-panel-resumen');

select cron.schedule(
  'mi-panel-resumen',
  '2,7,32,37 * * * *',
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

-- Mi Panel · 0009 · Avisos del asesor de Supabase. Aplicada el 10 nov 2026.

-- solo_propietario() es la función del disparador que impide registrarse a cualquier otra cuenta.
-- Al ser SECURITY DEFINER, anon y authenticated podían llamarla por /rest/v1/rpc (fallaría por ser de
-- disparador, pero no tiene por qué estar expuesta). Los disparadores no comprueban este permiso al
-- ejecutarse; aun así se deja explícito para el rol de Auth.
revoke execute on function public.solo_propietario() from public, anon, authenticated;
grant execute on function public.solo_propietario() to supabase_auth_admin;

-- Índice para la clave ajena de suscripciones_push (la emergencia y el envío filtran por usuario).
create index if not exists suscripciones_push_user_id_idx on public.suscripciones_push (user_id);

-- Avisos que quedan, a propósito:
-- · «RLS sin políticas» en resumenes, suscripciones_push y claves_app: solo las usa el servidor con la
--   clave secreta; sin políticas, nadie más puede leerlas.
-- · «pg_net en public»: sus funciones están en el esquema net, que la API no expone. Moverla obliga a
--   borrar y recrear la extensión, lo que cortaría el cron.
-- · «Protección de contraseñas filtradas»: no aplica, solo se entra con Google.

-- Mi Panel · Fase 2
-- Guarda (cifrado) el permiso de Google Calendar y los ajustes del panel.
-- Cada fila solo es visible y editable por su dueño (RLS). La app usa la clave publicable
-- con la sesión del usuario: no hace falta la secret key.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.conexiones_google (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_cifrado text not null,
  scopes text not null,
  actualizado timestamptz not null default now()
);

create table if not exists public.ajustes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

alter table public.conexiones_google enable row level security;
alter table public.ajustes enable row level security;

drop policy if exists "conexiones_google: solo el dueño" on public.conexiones_google;
create policy "conexiones_google: solo el dueño" on public.conexiones_google
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ajustes: solo el dueño" on public.ajustes;
create policy "ajustes: solo el dueño" on public.ajustes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Sin acceso para usuarios anónimos.
revoke all on public.conexiones_google from anon;
revoke all on public.ajustes from anon;

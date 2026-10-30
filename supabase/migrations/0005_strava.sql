-- Mi Panel · Fase 7
-- Permiso de Strava (solo lectura de actividades). El refresh token va cifrado con AES-256-GCM.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.conexiones_strava (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_cifrado text not null,
  scopes text not null,
  actualizado timestamptz not null default now()
);

alter table public.conexiones_strava enable row level security;

drop policy if exists "conexiones_strava: solo el dueño" on public.conexiones_strava;
create policy "conexiones_strava: solo el dueño" on public.conexiones_strava
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.conexiones_strava from anon;

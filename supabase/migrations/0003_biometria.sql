-- Mi Panel · Fase 4
-- Llaves de acceso (huella del S25, Windows Hello del PC) que desbloquean Finanzas.
-- Solo se guarda la clave PÚBLICA de cada dispositivo: la huella nunca sale del equipo.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.credenciales_biometria (
  id text primary key,                         -- id de la credencial (base64url)
  user_id uuid not null references auth.users (id) on delete cascade,
  clave_publica text not null,                 -- base64url (COSE)
  contador bigint not null default 0,
  transportes text[] not null default '{}',
  nombre text not null default 'Dispositivo',
  creado timestamptz not null default now(),
  usado timestamptz
);

create index if not exists credenciales_biometria_user on public.credenciales_biometria (user_id);

alter table public.credenciales_biometria enable row level security;

drop policy if exists "credenciales_biometria: solo el dueño" on public.credenciales_biometria;
create policy "credenciales_biometria: solo el dueño" on public.credenciales_biometria
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.credenciales_biometria from anon;

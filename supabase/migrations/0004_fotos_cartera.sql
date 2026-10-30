-- Mi Panel · Fase 6
-- Una foto diaria del valor de la cartera (valor y aportado), cifrada con AES-256-GCM en la app:
-- la base de datos solo ve la fecha y un texto cifrado. Sirve para la evolución mensual.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.fotos_cartera (
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  datos_cifrados text not null,
  creado timestamptz not null default now(),
  primary key (user_id, fecha)
);

alter table public.fotos_cartera enable row level security;

drop policy if exists "fotos_cartera: solo el dueño" on public.fotos_cartera;
create policy "fotos_cartera: solo el dueño" on public.fotos_cartera
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.fotos_cartera from anon;

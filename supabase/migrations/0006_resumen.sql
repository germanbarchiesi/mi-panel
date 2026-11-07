-- Mi Panel · Fase 9 · Resumen de las 7:00
-- Ejecutar una vez en Supabase > SQL Editor (después de 0001-0005).
-- Solo la app (con la clave secreta del servidor) usa estas tablas; el texto del resumen va cifrado.

-- Un resumen por día. El texto (lleva títulos de tareas y eventos) va cifrado con AES-256-GCM.
create table if not exists public.resumenes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  tz text not null,
  estado text not null default 'preparando' check (estado in ('preparando', 'listo', 'error')),
  texto_cifrado text,
  token_hash text,                -- enlace de un solo uso para GitHub Actions (solo el hash)
  token_caduca timestamptz,
  texto_descargado boolean not null default false,
  audio_path text,
  notificado timestamptz,
  creado timestamptz not null default now(),
  unique (user_id, fecha)
);

-- Dispositivos con notificaciones activadas (Web Push).
create table if not exists public.suscripciones_push (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  nombre text not null default 'Dispositivo',
  creado timestamptz not null default now()
);

-- Claves que genera la propia app (p. ej. VAPID para Web Push), cifradas.
create table if not exists public.claves_app (
  nombre text primary key,
  valor_cifrado text not null,
  creado timestamptz not null default now()
);

-- RLS sin políticas: nadie con la clave pública ni con sesión de usuario las lee; solo el servidor.
alter table public.resumenes enable row level security;
alter table public.suscripciones_push enable row level security;
alter table public.claves_app enable row level security;
revoke all on public.resumenes, public.suscripciones_push, public.claves_app from anon, authenticated;

-- Audios del feed: almacenamiento privado (sin políticas: solo el servidor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', false, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;

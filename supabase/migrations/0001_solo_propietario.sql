-- Mi Panel · Fase 1
-- Segunda barrera de acceso: aunque alguien consiguiera iniciar sesión con Google,
-- Supabase no crea ningún usuario cuyo email no sea el del propietario.
-- Ejecutar una vez en Supabase > SQL Editor.

create or replace function public.solo_propietario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) is distinct from 'german.barchiesi@gmail.com' then
    raise exception 'Registro no permitido';
  end if;
  return new;
end;
$$;

drop trigger if exists solo_propietario_trg on auth.users;
create trigger solo_propietario_trg
  before insert on auth.users
  for each row execute function public.solo_propietario();

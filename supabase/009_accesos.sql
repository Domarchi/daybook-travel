begin;

-- Accesos: quién puede entrar a Daybook Travel, administrado desde la propia
-- aplicación en vez de con SQL a mano.
--
-- Respeta las reglas de siempre:
--   * Nadie borra nada. Quitar un acceso es desactivarlo, y se puede reactivar.
--   * Toda escritura queda en `history`, con quién la hizo.
--   * La seguridad vive aquí, no en la pantalla: la tabla sigue sin ningún
--     permiso para el navegador y todo pasa por funciones que comprueban que
--     quien llama es administrador.
--
-- La cuenta (el usuario de Supabase Auth) se comparte con otras aplicaciones de
-- Daybook y se crea fuera de esta. Aquí solo se decide quién de esas cuentas
-- puede entrar a Travel.

alter table public.members
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists role text not null default 'member',
  add column if not exists active boolean not null default true;

alter table public.members drop constraint if exists members_id_key;
alter table public.members add constraint members_id_key unique (id);

alter table public.members drop constraint if exists members_role_check;
alter table public.members
  add constraint members_role_check check (role in ('admin', 'member'));

-- El primer administrador. Si el correo todavía no está en la lista (una
-- instalación nueva) no se crea nada: se agrega con un INSERT y se le pone
-- role = 'admin' a mano la primera vez; de ahí en adelante, desde la pantalla.
update public.members
set role = 'admin'
where email = 'joaquindomarchi@gmail.com';

-- Desactivado equivale a no estar: es lo que lee todo el resto del sistema.
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.members
    where email = lower(auth.jwt() ->> 'email')
      and active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.members
    where email = lower(auth.jwt() ->> 'email')
      and active
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Quién fue agregado, quién cambió de rol, quién se desactivó: lo mismo que
-- ya se guarda de personas y viajes.
drop trigger if exists members_audit on public.members;
create trigger members_audit
  after insert or update on public.members
  for each row execute function public.audit_change();

-- Los correos de los demás no son asunto de todos: el historial de accesos
-- solo lo lee un administrador. El resto del historial no cambia.
drop policy if exists history_read on public.history;
create policy history_read on public.history
  for select to authenticated
  using (public.is_member() and (entity <> 'members' or public.is_admin()));

create or replace function public.list_members()
returns table (email text, role text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado';
  end if;

  return query
    select m.email, m.role, m.active, m.created_at
    from public.members m
    order by m.active desc, m.role, m.email;
end;
$$;

create or replace function public.add_member(p_email text, p_role text default 'member')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_actual public.members;
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'El rol debe ser admin o member';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Escribe un correo válido';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.members'));

  select * into v_actual from public.members where email = v_email for update;
  if not found then
    insert into public.members (email, role) values (v_email, p_role);
  elsif v_actual.active then
    raise exception 'Ese correo ya tiene acceso';
  else
    update public.members set active = true, role = p_role where email = v_email;
  end if;
end;
$$;

create or replace function public.set_member_active(p_email text, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_active is null then
    raise exception 'Indica si el acceso queda activo o no';
  end if;
  if not p_active and v_email = lower(auth.jwt() ->> 'email') then
    raise exception 'No puedes quitarte tu propio acceso';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.members'));

  if not exists (select 1 from public.members where email = v_email) then
    raise exception 'Ese correo no está en la lista';
  end if;

  update public.members
  set active = p_active
  where email = v_email and active is distinct from p_active;
end;
$$;

create or replace function public.set_member_role(p_email text, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'El rol debe ser admin o member';
  end if;
  if p_role <> 'admin' and v_email = lower(auth.jwt() ->> 'email') then
    raise exception 'No puedes quitarte tu propio rol de administrador';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.members'));

  if not exists (select 1 from public.members where email = v_email) then
    raise exception 'Ese correo no está en la lista';
  end if;

  update public.members
  set role = p_role
  where email = v_email and role is distinct from p_role;

  -- Con la guarda de arriba esto no debería pasar nunca; queda como red de
  -- seguridad para que el sistema jamás se quede sin administrador.
  if not exists (select 1 from public.members where active and role = 'admin') then
    raise exception 'Debe quedar al menos un administrador';
  end if;
end;
$$;

revoke all on function public.list_members() from public, anon;
revoke all on function public.add_member(text, text) from public, anon;
revoke all on function public.set_member_active(text, boolean) from public, anon;
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.list_members() to authenticated;
grant execute on function public.add_member(text, text) to authenticated;
grant execute on function public.set_member_active(text, boolean) to authenticated;
grant execute on function public.set_member_role(text, text) to authenticated;

commit;

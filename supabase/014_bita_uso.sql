begin;

-- Cupo diario de Bita, la asistente de Travel.
--
-- Cada pregunta a Bita usa un modelo de pago, así que cada persona tiene un
-- número de mensajes por día (hora de Santiago). Esta tabla solo cuenta: no
-- guarda preguntas, respuestas ni datos de viajes.
--
-- Solo la llave de servicio puede tocar el contador, a través de estas dos
-- funciones. La ruta de Bita en el servidor verifica primero la sesión de la
-- persona y después reserva por su id. El navegador no puede llamarlas: si
-- pudiera, cualquiera se devolvería mensajes a sí mismo y el cupo no valdría.
--
-- No es un dato de la operación (no es una persona, un viaje ni un documento),
-- así que no pasa por audit_change(): sería una fila de historial por pregunta.
-- Tampoco se borra: las filas de días pasados se quedan, son una cuenta chica.
--
-- La base es compartida con Daybook Asistencia: todo es nuevo y con nombre de
-- Travel (bita_*); no toca nada existente. Se registra como travel_014_bita_uso.

create table if not exists public.bita_usage (
  user_id uuid not null,
  day date not null,
  messages integer not null default 0 check (messages >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.bita_usage enable row level security;
revoke all on public.bita_usage from public, anon, authenticated;

-- Reserva un mensaje si quedan. Una sola sentencia: dos preguntas a la vez no
-- pueden tomar juntas el último. Devuelve si se pudo y cuántos lleva hoy.
create or replace function public.bita_reserve_message(p_user uuid, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql security definer set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
  n integer;
begin
  if p_user is null or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Cupo de Bita no válido';
  end if;
  insert into public.bita_usage as u (user_id, day, messages, updated_at)
  values (p_user, hoy, 1, now())
  on conflict (user_id, day) do update
    set messages = u.messages + 1, updated_at = now()
    where u.messages < p_limit
  returning u.messages into n;
  if n is null then
    select u.messages into n from public.bita_usage u where u.user_id = p_user and u.day = hoy;
    return query select false, coalesce(n, p_limit);
  else
    return query select true, n;
  end if;
end;
$$;

-- Devuelve un mensaje que no llegó a costar nada (la API falló antes de cobrar).
create or replace function public.bita_refund_message(p_user uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.bita_usage
     set messages = greatest(messages - 1, 0), updated_at = now()
   where user_id = p_user and day = (now() at time zone 'America/Santiago')::date;
$$;

-- Cuántos lleva hoy, para mostrar «te quedan N» al abrir.
create or replace function public.bita_messages_today(p_user uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select messages from public.bita_usage
     where user_id = p_user and day = (now() at time zone 'America/Santiago')::date
  ), 0);
$$;

revoke all on function public.bita_reserve_message(uuid, integer) from public, anon, authenticated;
revoke all on function public.bita_refund_message(uuid) from public, anon, authenticated;
revoke all on function public.bita_messages_today(uuid) from public, anon, authenticated;
grant execute on function public.bita_reserve_message(uuid, integer) to service_role;
grant execute on function public.bita_refund_message(uuid) to service_role;
grant execute on function public.bita_messages_today(uuid) to service_role;

commit;

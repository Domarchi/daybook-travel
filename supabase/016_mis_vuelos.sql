begin;

-- Mis vuelos: cada trabajador consulta sus propios viajes con su RUT y un
-- código de 4 dígitos, sin cuenta de Supabase Auth.
--
-- Cómo se protege, todo aquí y no en la pantalla:
--   * El navegador del trabajador no tiene sesión de Auth: habla con la base
--     como `anon`, y `anon` no tiene ningún permiso sobre las tablas. Solo
--     puede llamar a cuatro funciones (entrar, ver sus viajes, salir y el
--     calendario), y cada una devuelve únicamente lo de la persona dueña del
--     token: nunca otra ficha, nunca el monto ni las notas.
--   * El código lo genera la base (no lo elige nadie) y se guarda resumido con
--     sal, nunca tal cual. Se muestra una sola vez, a quien lo entregó.
--   * Cinco intentos fallidos seguidos bloquean ese RUT hasta que la
--     coordinación entregue un código nuevo. Cuatro dígitos son diez mil
--     combinaciones; con el bloqueo, quien prueba tiene cinco.
--   * La sesión es un token al azar que el teléfono guarda; la base guarda solo
--     su resumen. Vence a los 180 días, y un código nuevo, quitar el acceso o
--     desactivar la ficha la cortan.
--
-- Reglas de siempre:
--   * Nadie borra nada: no hay DELETE. Una sesión se revoca (revoked_at); un
--     acceso se bloquea.
--   * Lo que es de la operación queda en `history`: los datos de contacto de la
--     ficha (pasan por audit_change() como el resto de `people`) y cada código
--     entregado, bloqueo o acceso quitado (entidad `worker_access`, sin el
--     resumen del código). Los intentos de entrada y las sesiones no: son
--     cuentas, como el cupo de Bita (014), no datos de la operación.
--
-- La base es compartida con Daybook Asistencia: todo lo nuevo es de Travel y
-- no toca nada de ella. Se registra como travel_016_mis_vuelos.
--
-- En Supabase, lo que se crea en `public` queda por omisión con permisos para
-- `anon` y `authenticated`. Por eso cada tabla y cada función de aquí los
-- revoca explícitamente antes de conceder lo justo.

-- ---------------------------------------------------------------------------
-- Datos de contacto en la ficha. Los tres son opcionales.

-- RUT chileno: cuerpo de 7 u 8 dígitos, guion y dígito verificador (0-9 o K),
-- sin puntos. El dígito verificador se comprueba (módulo 11).
create or replace function public.rut_valido(p_rut text)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  cuerpo text;
  suma integer := 0;
  factor integer := 2;
  resto integer;
  esperado text;
begin
  if p_rut is null or p_rut !~ '^[0-9]{7,8}-[0-9K]$' then
    return false;
  end if;
  cuerpo := split_part(p_rut, '-', 1);
  for i in reverse length(cuerpo)..1 loop
    suma := suma + substr(cuerpo, i, 1)::integer * factor;
    factor := case when factor = 7 then 2 else factor + 1 end;
  end loop;
  resto := 11 - (suma % 11);
  esperado := case resto when 11 then '0' when 10 then 'K' else resto::text end;
  return split_part(p_rut, '-', 2) = esperado;
end;
$$;

-- Lo que escribe la persona (con puntos, espacios, k minúscula) llevado a la
-- forma guardada. No valida: eso lo hace rut_valido().
create or replace function public.rut_normalizado(p_rut text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when length(limpio) < 2 then limpio
    else left(limpio, length(limpio) - 1) || '-' || right(limpio, 1)
  end
  from (select upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')) as limpio) r;
$$;

alter table public.people
  add column if not exists rut text,
  add column if not exists phone text,
  add column if not exists email text;

alter table public.people drop constraint if exists people_rut_check;
alter table public.people
  add constraint people_rut_check check (rut is null or public.rut_valido(rut));

-- Internacional, con el +: es lo que espera WhatsApp. +56 9 1234 5678 se
-- guarda +56912345678.
alter table public.people drop constraint if exists people_phone_check;
alter table public.people
  add constraint people_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');

alter table public.people drop constraint if exists people_email_check;
alter table public.people
  add constraint people_email_check check (
    email is null or (
      email = lower(email)
      and length(email) <= 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

-- Un RUT entra a una sola ficha activa. Una ficha vieja e inactiva puede
-- conservar el suyo (para eso no se borra nada).
create unique index if not exists people_rut_activo_unique
  on public.people (rut) where rut is not null and active;

-- ---------------------------------------------------------------------------
-- El acceso de cada persona: su código (resumido) y si está bloqueado.

create table if not exists public.worker_access (
  person_id uuid primary key references public.people (id),
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked boolean not null default false,
  pin_set_at timestamptz not null default now(),
  pin_set_by uuid,
  -- Lo que va en el enlace del calendario. Calendario y teléfono lo piden sin
  -- código, así que es su propia llave; cambia con cada código nuevo.
  calendar_token text not null unique,
  updated_at timestamptz not null default now()
);
alter table public.worker_access enable row level security;
revoke all on public.worker_access from public, anon, authenticated;

create table if not exists public.worker_sessions (
  token_hash text primary key,
  person_id uuid not null references public.people (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table public.worker_sessions enable row level security;
revoke all on public.worker_sessions from public, anon, authenticated;
create index if not exists worker_sessions_person_idx on public.worker_sessions (person_id);

-- El historial del acceso: quién entregó un código, cuándo se bloqueó, cuándo
-- se quitó. Nunca el resumen ni la sal: el historial lo leen los miembros, y
-- con cuatro dígitos un resumen se revierte probando diez mil.
create or replace function public.audit_worker_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE'
     and new.pin_set_at is not distinct from old.pin_set_at
     and new.locked is not distinct from old.locked then
    return new;
  end if;
  insert into public.history (entity, record_id, actor, action, before_data, after_data)
  values (
    'worker_access',
    new.person_id,
    auth.uid(),
    TG_OP,
    case when TG_OP = 'UPDATE'
      then jsonb_build_object('pin_set_at', old.pin_set_at, 'locked', old.locked)
      else null end,
    jsonb_build_object('pin_set_at', new.pin_set_at, 'locked', new.locked)
  );
  return new;
end;
$$;
revoke all on function public.audit_worker_access() from public, anon, authenticated;

drop trigger if exists worker_access_audit on public.worker_access;
create trigger worker_access_audit
  after insert or update on public.worker_access
  for each row execute function public.audit_worker_access();

-- Utilidades internas: un secreto al azar y su resumen. gen_random_uuid() usa
-- el generador fuerte del sistema y es del núcleo de PostgreSQL (sin
-- extensiones), igual que sha256().
create or replace function public.worker_random_hex()
returns text
language sql volatile set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.worker_digest(p_text text)
returns text
language sql immutable set search_path = ''
as $$
  select encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
$$;

revoke all on function public.worker_random_hex() from public, anon, authenticated;
revoke all on function public.worker_digest(text) from public, anon, authenticated;
revoke all on function public.rut_valido(text) from public, anon, authenticated;
revoke all on function public.rut_normalizado(text) from public, anon, authenticated;
-- El check de people.rut llama a rut_valido(): quien escribe en people tiene
-- que poder ejecutarla.
grant execute on function public.rut_valido(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que hace la coordinación (miembros, con sesión).

-- Entrega un código nuevo: lo devuelve una sola vez, desbloquea, corta las
-- sesiones abiertas y cambia el enlace del calendario.
create or replace function public.worker_access_give_code(p_person uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_person public.people;
  v_pin text;
  v_salt text := public.worker_random_hex();
begin
  if not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;
  select * into v_person from public.people where id = p_person for update;
  if v_person.id is null then
    raise exception 'La persona no existe';
  end if;
  if not v_person.active then
    raise exception 'La persona está inactiva: actívala antes de darle acceso';
  end if;
  if v_person.rut is null then
    raise exception 'Agrega el RUT de la persona antes de darle un código';
  end if;

  -- Cuatro dígitos al azar, sin los que cualquiera prueba primero.
  loop
    v_pin := lpad(((('x' || substr(public.worker_random_hex(), 1, 12))::bit(48)::bigint) % 10000)::text, 4, '0');
    exit when v_pin !~ '^(.)\1{3}$'
      and v_pin not in ('0123', '1234', '2345', '3456', '4567', '5678', '6789',
                        '9876', '8765', '7654', '6543', '5432', '4321', '3210');
  end loop;

  insert into public.worker_access as a
    (person_id, pin_salt, pin_hash, failed_attempts, locked, pin_set_at, pin_set_by, calendar_token, updated_at)
  values
    (p_person, v_salt, public.worker_digest(v_salt || ':' || v_pin), 0, false, clock_timestamp(), auth.uid(),
     public.worker_random_hex(), clock_timestamp())
  on conflict (person_id) do update set
    pin_salt = excluded.pin_salt,
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked = false,
    pin_set_at = excluded.pin_set_at,
    pin_set_by = excluded.pin_set_by,
    calendar_token = excluded.calendar_token,
    updated_at = excluded.updated_at;

  update public.worker_sessions
  set revoked_at = clock_timestamp()
  where person_id = p_person and revoked_at is null;

  return v_pin;
end;
$$;

-- Quita el acceso (teléfono perdido, la persona ya no trabaja ahí): bloquea y
-- corta las sesiones. Se devuelve con un código nuevo.
create or replace function public.worker_access_revoke(p_person uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;
  update public.worker_access
  set locked = true, updated_at = clock_timestamp()
  where person_id = p_person and not locked;
  update public.worker_sessions
  set revoked_at = clock_timestamp()
  where person_id = p_person and revoked_at is null;
end;
$$;

-- Lo que la ficha muestra: si tiene código, desde cuándo y si está bloqueado.
-- Nunca el resumen, la sal ni el enlace del calendario.
create or replace function public.worker_access_list()
returns table (person_id uuid, pin_set_at timestamptz, locked boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;
  return query
    select a.person_id, a.pin_set_at, a.locked
    from public.worker_access a;
end;
$$;

revoke all on function public.worker_access_give_code(uuid) from public, anon, authenticated;
revoke all on function public.worker_access_revoke(uuid) from public, anon, authenticated;
revoke all on function public.worker_access_list() from public, anon, authenticated;
grant execute on function public.worker_access_give_code(uuid) to authenticated;
grant execute on function public.worker_access_revoke(uuid) to authenticated;
grant execute on function public.worker_access_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que hace el trabajador (sin sesión de Auth: rol anon).

-- Entra con RUT y código. No lanza errores: devuelve {ok, motivo}, porque un
-- error desharía la cuenta de intentos fallidos. Un RUT que no existe y un
-- código equivocado responden lo mismo.
create or replace function public.worker_sign_in(p_rut text, p_pin text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_rut text := public.rut_normalizado(p_rut);
  v_person public.people;
  v_access public.worker_access;
  v_token text;
  v_intentos integer;
begin
  if not public.rut_valido(v_rut) or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'motivo', 'incorrecto');
  end if;

  select * into v_person from public.people where rut = v_rut and active;
  if v_person.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'incorrecto');
  end if;

  -- Bloquea la fila: dos intentos a la vez no pueden contar uno solo.
  select * into v_access from public.worker_access where person_id = v_person.id for update;
  if v_access.person_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'incorrecto');
  end if;
  if v_access.locked then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;

  if public.worker_digest(v_access.pin_salt || ':' || p_pin) <> v_access.pin_hash then
    v_intentos := v_access.failed_attempts + 1;
    update public.worker_access
    set failed_attempts = v_intentos,
        locked = v_intentos >= 5,
        updated_at = clock_timestamp()
    where person_id = v_person.id;
    return jsonb_build_object('ok', false, 'motivo', case when v_intentos >= 5 then 'bloqueado' else 'incorrecto' end);
  end if;

  if v_access.failed_attempts > 0 then
    update public.worker_access set failed_attempts = 0, updated_at = clock_timestamp()
    where person_id = v_person.id;
  end if;

  v_token := public.worker_random_hex();
  insert into public.worker_sessions (token_hash, person_id, expires_at)
  values (public.worker_digest(v_token), v_person.id, clock_timestamp() + interval '180 days');

  return jsonb_build_object('ok', true, 'token', v_token, 'nombre', v_person.name);
end;
$$;

-- La persona dueña de una sesión vigente, o nada.
create or replace function public.worker_person_of(p_token text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.person_id
  from public.worker_sessions s
  join public.people p on p.id = s.person_id
  join public.worker_access a on a.person_id = s.person_id
  where s.token_hash = public.worker_digest(coalesce(p_token, ''))
    and s.revoked_at is null
    and s.expires_at > now()
    and p.active
    and p.rut is not null
    and not a.locked;
$$;
revoke all on function public.worker_person_of(text) from public, anon, authenticated;

-- Los viajes de una persona como los ve ella: sin anulados, desde 60 días
-- atrás, sin monto ni notas.
create or replace function public.worker_trips_of(p_person uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with hoy as (select (now() at time zone 'America/Santiago')::date as dia)
  select jsonb_build_object(
    'hoy', h.dia,
    'persona', jsonb_build_object(
      'nombre', p.name,
      'origen', p.origin,
      'destino', p.destination,
      'turno', p.shift,
      'tiene_correo', p.email is not null,
      'tiene_telefono', p.phone is not null
    ),
    'viajes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'fecha', t.date,
          'sentido', t.direction,
          'origen', t.origin,
          'destino', t.destination,
          'hora', to_char(t.requested_time, 'HH24:MI'),
          'estado', t.status,
          'reserva', t.pnr,
          'vuelo', t.flight,
          'equipaje', t.baggage
        )
        order by t.date, t.requested_time nulls last, t.direction desc
      )
      from public.trips t
      where t.person_id = p.id
        and t.status <> 'Anulado'
        and t.date >= h.dia - 60
    ), '[]'::jsonb)
  )
  from public.people p, hoy h
  where p.id = p_person;
$$;
revoke all on function public.worker_trips_of(uuid) from public, anon, authenticated;

create or replace function public.worker_trips(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_person uuid := public.worker_person_of(p_token);
begin
  if v_person is null then
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  return public.worker_trips_of(v_person)
    || jsonb_build_object(
      'ok', true,
      'calendario', (select a.calendar_token from public.worker_access a where a.person_id = v_person)
    );
end;
$$;

create or replace function public.worker_sign_out(p_token text)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.worker_sessions
  set revoked_at = clock_timestamp()
  where token_hash = public.worker_digest(coalesce(p_token, ''))
    and revoked_at is null;
$$;

-- El calendario del teléfono: lo mismo, con el token del enlace del
-- calendario en vez del de la sesión.
create or replace function public.worker_calendar(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_person uuid;
begin
  select a.person_id into v_person
  from public.worker_access a
  join public.people p on p.id = a.person_id
  where a.calendar_token = coalesce(p_token, '')
    and length(coalesce(p_token, '')) = 64
    and not a.locked
    and p.active
    and p.rut is not null;
  if v_person is null then
    return jsonb_build_object('ok', false, 'motivo', 'sesion');
  end if;
  return public.worker_trips_of(v_person) || jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.worker_sign_in(text, text) from public, anon, authenticated;
revoke all on function public.worker_trips(text) from public, anon, authenticated;
revoke all on function public.worker_sign_out(text) from public, anon, authenticated;
revoke all on function public.worker_calendar(text) from public, anon, authenticated;
grant execute on function public.worker_sign_in(text, text) to anon, authenticated;
grant execute on function public.worker_trips(text) to anon, authenticated;
grant execute on function public.worker_sign_out(text) to anon, authenticated;
grant execute on function public.worker_calendar(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- El recordatorio del día antes (cron de Vercel, llave de servicio).
--
-- Solo viajes de mañana con código de reserva (Solicitado o Emitido): un
-- Planificado sin pasaje la víspera casi siempre es un viaje que no se va a
-- volar (ver «sin cerrar» en lib/purchase.ts), y avisarle a alguien que viaja
-- mañana cuando no viaja es peor que no avisar. Solo personas activas con
-- correo o teléfono. No escribe nada.
create or replace function public.worker_reminder_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with hoy as (select (now() at time zone 'America/Santiago')::date as dia)
  select jsonb_build_object(
    'hoy', h.dia,
    'manana', h.dia + 1,
    'viajes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'persona', p.name,
          'correo', p.email,
          'telefono', p.phone,
          'fecha', t.date,
          'sentido', t.direction,
          'origen', t.origin,
          'destino', t.destination,
          'hora', to_char(t.requested_time, 'HH24:MI'),
          'vuelo', t.flight,
          'reserva', t.pnr,
          'equipaje', t.baggage
        )
        order by t.requested_time nulls last, p.name
      )
      from public.trips t
      join public.people p on p.id = t.person_id
      where t.date = h.dia + 1
        and t.status in ('Solicitado', 'Emitido')
        and length(trim(t.pnr)) > 0
        and p.active
        and (p.email is not null or p.phone is not null)
    ), '[]'::jsonb)
  )
  from hoy h;
$$;

revoke all on function public.worker_reminder_data() from public, anon, authenticated;
grant execute on function public.worker_reminder_data() to service_role;

commit;

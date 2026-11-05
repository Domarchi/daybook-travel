begin;

-- Read the original planning identity without rewriting legacy trips or their
-- audit trail. Older browser versions left planned_date null, even after a
-- trip was rescheduled. The first audited date is authoritative in that case;
-- the current date is deliberately not a fallback.
create or replace function public.trip_planning_dates()
returns table (trip_id uuid, planned_date date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_row record;
  v_original date;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;

  for v_row in
    select t.id, t.planned_date as stored_date, evidence.original_date
    from public.trips t
    left join lateral (
      select case h.action
        when 'INSERT' then h.after_data ->> 'date'
        when 'UPDATE' then h.before_data ->> 'date'
      end as original_date
      from public.history h
      where h.entity = 'trips' and h.record_id = t.id
        and h.action in ('INSERT', 'UPDATE')
      order by case h.action when 'INSERT' then 0 else 1 end, h.id
      limit 1
    ) evidence on t.planned_date is null
  loop
    v_original := v_row.stored_date;
    if v_original is null and v_row.original_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin
        v_original := v_row.original_date::date;
        if to_char(v_original, 'YYYY-MM-DD') <> v_row.original_date then
          v_original := null;
        end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_original := null;
      end;
    end if;
    trip_id := v_row.id;
    planned_date := v_original;
    return next;
  end loop;
end;
$$;

revoke all on function public.trip_planning_dates() from public, anon;
grant execute on function public.trip_planning_dates() to authenticated;

-- The browser owns the single cycle engine. This RPC accepts only its proposed
-- movements; person details, state, baggage and route come from current rows.
-- Locking people in a stable order serializes concurrent generation requests.
-- Both unique indexes remain useful: ON CONFLICT without a target also handles
-- the partial index on (person_id, planned_date, direction).
create or replace function public.generate_trip_movements(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_date date;
  v_person public.people%rowtype;
  v_count integer;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Los movimientos deben ser una lista';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'Planifica como máximo 10000 movimientos por solicitud';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or not (v_row ?& array['person_id', 'date', 'direction'])
      or v_row - 'person_id' - 'date' - 'direction' <> '{}'::jsonb then
      raise exception 'Cada movimiento necesita solo persona, fecha y sentido';
    end if;
    if jsonb_typeof(v_row -> 'person_id') is distinct from 'string'
      or v_row ->> 'person_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(v_row -> 'date') is distinct from 'string'
      or v_row ->> 'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(v_row -> 'direction') is distinct from 'string'
      or v_row ->> 'direction' not in ('SUBIDA', 'BAJADA') then
      raise exception 'El movimiento contiene una persona, fecha o sentido inválido';
    end if;
    v_date := (v_row ->> 'date')::date;
    if to_char(v_date, 'YYYY-MM-DD') <> v_row ->> 'date' then
      raise exception 'La fecha del movimiento no es válida';
    end if;
  end loop;

  perform p.id
  from public.people p
  where p.id in (
    select (r.value ->> 'person_id')::uuid from jsonb_array_elements(p_rows) r
  )
  order by p.id
  for update;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    select * into v_person from public.people where id = (v_row ->> 'person_id')::uuid;
    if not found then
      raise exception 'No se encontró una persona de la planificación';
    end if;
    if not v_person.active or v_person.shift not in ('4×3', '10×10') then
      raise exception 'La planificación necesita personas activas con turno 4×3 o 10×10';
    end if;
    v_date := (v_row ->> 'date')::date;
    if v_date < v_person.start_date or (v_person.end_date is not null and v_date > v_person.end_date) then
      raise exception 'El movimiento debe estar dentro de la vigencia de la persona';
    end if;
  end loop;

  if exists (
    select 1
    from public.trips t
    join public.trip_planning_dates() identity on identity.trip_id = t.id
    where t.person_id in (
      select (r.value ->> 'person_id')::uuid from jsonb_array_elements(p_rows) r
    ) and identity.planned_date is null
  ) then
    raise exception 'Hay viajes históricos sin fecha original comprobable. Revisa su historial antes de planificar esta persona';
  end if;

  with requested as (
    select distinct
      (r.value ->> 'person_id')::uuid as person_id,
      (r.value ->> 'date')::date as date,
      r.value ->> 'direction' as direction
    from jsonb_array_elements(p_rows) r
  ), identities as materialized (
    select * from public.trip_planning_dates()
  )
  insert into public.trips (
    person_id, date, planned_date, direction, origin, destination, baggage
  )
  select p.id, r.date, r.date, r.direction,
    case when r.direction = 'SUBIDA' then p.origin else p.destination end,
    case when r.direction = 'SUBIDA' then p.destination else p.origin end,
    p.baggage
  from requested r
  join public.people p on p.id = r.person_id
  where not exists (
    select 1 from public.trips t
    join identities identity on identity.trip_id = t.id
    where t.person_id = p.id and t.direction = r.direction
      and (t.date = r.date or identity.planned_date = r.date)
  )
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.generate_trip_movements(jsonb) from public, anon;
grant execute on function public.generate_trip_movements(jsonb) to authenticated;

commit;

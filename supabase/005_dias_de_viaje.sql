begin;

-- Días de viaje configurables por persona.
--
-- Hasta ahora el 4×3 era lunes y jueves para todo el mundo, grabado a fuego en
-- tres lugares distintos: lib/calendar.ts, generate_pulse() y esta función de
-- importación. Desde aquí los dos días viven en la ficha de cada persona y el
-- único que decide fechas es el motor de lib/cycles.ts.
--
-- Los valores por omisión son lunes y jueves, así que todas las personas que ya
-- están cargadas conservan exactamente el calendario que tenían.

alter table public.people
  add column if not exists up_weekday smallint not null default 1,
  add column if not exists down_weekday smallint not null default 4;

comment on column public.people.up_weekday is
  'Día de subida en jornada 4×3. 1 = lunes … 7 = domingo. No se usa en 10×10.';
comment on column public.people.down_weekday is
  'Día de bajada en jornada 4×3. 1 = lunes … 7 = domingo. No se usa en 10×10.';

alter table public.people
  drop constraint if exists people_up_weekday_check,
  drop constraint if exists people_down_weekday_check,
  drop constraint if exists people_weekdays_distinct_check;

alter table public.people
  add constraint people_up_weekday_check check (up_weekday between 1 and 7),
  add constraint people_down_weekday_check check (down_weekday between 1 and 7),
  add constraint people_weekdays_distinct_check check (up_weekday <> down_weekday);

-- La importación de Excel exigía que un 4×3 empezara un lunes. Con los días
-- configurables esa regla ya no corresponde: alguien que sube los martes tiene
-- que poder empezar un martes. Es la única diferencia con la versión de la
-- migración 004; el resto de la función es idéntico.

create or replace function public.sync_excel_batch(
  p_sync_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_payload_hash text;
  v_existing_run public.sync_runs%rowtype;
  v_claimed integer;
  v_people_payload jsonb;
  v_trips_payload jsonb;
  v_row jsonb;
  v_position integer := 0;
  v_row_number integer;
  v_id uuid;
  v_expected_version bigint;
  v_new_version bigint;
  v_current_version bigint;
  v_employee_code text;
  v_name text;
  v_origin text;
  v_destination text;
  v_shift text;
  v_start_date date;
  v_end_date date;
  v_baggage text;
  v_active boolean;
  v_person public.people%rowtype;
  v_trip public.trips%rowtype;
  v_person_id uuid;
  v_person_employee_code text;
  v_date date;
  v_planned_date date;
  v_direction text;
  v_requested_time time;
  v_status text;
  v_pnr text;
  v_flight text;
  v_amount numeric(12,2);
  v_notes text;
  v_change_reason text;
  v_error text;
  v_constraint text;
  v_result jsonb;
  v_applied boolean := true;
  v_people_inserted jsonb := '[]'::jsonb;
  v_people_updated jsonb := '[]'::jsonb;
  v_people_unchanged jsonb := '[]'::jsonb;
  v_people_conflicts jsonb := '[]'::jsonb;
  v_people_errors jsonb := '[]'::jsonb;
  v_trips_inserted jsonb := '[]'::jsonb;
  v_trips_updated jsonb := '[]'::jsonb;
  v_trips_unchanged jsonb := '[]'::jsonb;
  v_trips_conflicts jsonb := '[]'::jsonb;
  v_trips_errors jsonb := '[]'::jsonb;
begin
  if v_actor is null or not public.is_member() then
    raise exception 'Acceso no autorizado';
  end if;
  if p_sync_id is null then
    raise exception 'La sincronización necesita un identificador';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'El contenido de Excel no es válido';
  end if;

  v_people_payload := coalesce(p_payload -> 'people', '[]'::jsonb);
  v_trips_payload := coalesce(p_payload -> 'trips', '[]'::jsonb);
  if jsonb_typeof(v_people_payload) <> 'array'
     or jsonb_typeof(v_trips_payload) <> 'array' then
    raise exception 'Personas y viajes deben ser listas';
  end if;
  if jsonb_array_length(v_people_payload) > 5000
     or jsonb_array_length(v_trips_payload) > 10000 then
    raise exception 'El archivo supera el máximo permitido por sincronización';
  end if;

  v_payload_hash := md5(p_payload::text);
  insert into public.sync_runs (id, actor, payload_hash)
  values (p_sync_id, v_actor, v_payload_hash)
  on conflict (id) do nothing;
  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    select * into v_existing_run
    from public.sync_runs
    where id = p_sync_id;

    if v_existing_run.actor <> v_actor then
      raise exception 'Ese identificador de sincronización pertenece a otra cuenta';
    end if;
    if v_existing_run.payload_hash <> v_payload_hash then
      raise exception 'El identificador ya fue usado con otro contenido';
    end if;
    if v_existing_run.status = 'completed' and v_existing_run.result is not null then
      return v_existing_run.result || jsonb_build_object('idempotent', true);
    end if;
    raise exception 'La sincronización ya está en curso';
  end if;

  begin
    -- People are processed first so trips in the same workbook can resolve a
    -- newly inserted person by employee_code. The surrounding exception block
    -- rolls every mutation back if any row reports a conflict or error.
    v_position := 0;
    for v_row in select value from jsonb_array_elements(v_people_payload)
    loop
    v_position := v_position + 1;
    v_row_number := v_position;
    v_id := null;
    v_expected_version := null;
    v_current_version := null;
    v_constraint := null;
    begin
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'La fila no es un objeto válido';
      end if;
      if nullif(trim(coalesce(v_row ->> 'row_number', v_row ->> 'rowNumber')), '') is not null then
        v_row_number := coalesce(v_row ->> 'row_number', v_row ->> 'rowNumber')::integer;
      end if;
      if nullif(trim(coalesce(v_row ->> 'id', v_row ->> 'fccId')), '') is not null then
        v_id := coalesce(v_row ->> 'id', v_row ->> 'fccId')::uuid;
      end if;
      if nullif(trim(v_row ->> 'version'), '') is not null then
        v_expected_version := (v_row ->> 'version')::bigint;
      end if;
      if v_id is null and v_expected_version is not null then
        raise exception 'Deja la versión vacía al crear una persona';
      end if;

      v_employee_code := nullif(upper(trim(coalesce(v_row ->> 'employee_code', v_row ->> 'codigoPersona'))), '');
      v_name := trim(coalesce(v_row ->> 'name', v_row ->> 'nombreCompleto', ''));
      v_origin := trim(coalesce(v_row ->> 'origin', v_row ->> 'origen', ''));
      v_destination := trim(coalesce(v_row ->> 'destination', v_row ->> 'destino', ''));
      v_shift := coalesce(
        nullif(trim(coalesce(v_row ->> 'shift', v_row ->> 'turno')), ''),
        'Por confirmar'
      );
      v_start_date := nullif(trim(coalesce(v_row ->> 'start_date', v_row ->> 'fechaInicio')), '')::date;
      v_end_date := nullif(trim(coalesce(v_row ->> 'end_date', v_row ->> 'fechaTermino')), '')::date;
      v_baggage := trim(coalesce(v_row ->> 'baggage', v_row ->> 'equipaje', 'Por confirmar'));
      if lower(coalesce(v_row ->> 'active', v_row ->> 'activa', 'true')) not in ('true', 'false') then
        raise exception 'Activo debe ser verdadero o falso';
      end if;
      v_active := lower(coalesce(v_row ->> 'active', v_row ->> 'activa', 'true'))::boolean;

      if v_name = '' or v_origin = '' or v_destination = '' then
        raise exception 'Completa nombre, origen y destino';
      end if;
      if v_shift not in ('Por confirmar', '4×3', '10×10') then
        raise exception 'El turno debe ser Por confirmar, 4×3 o 10×10';
      end if;
      if v_start_date is null then
        raise exception 'Completa la fecha de inicio';
      end if;
      if v_end_date is not null and v_end_date < v_start_date then
        raise exception 'La fecha de término debe ser posterior al inicio';
      end if;

      if v_id is null then
        if v_employee_code is not null then
          select * into v_person
          from public.people
          where employee_code = v_employee_code;
          if found then
            v_people_conflicts := v_people_conflicts || jsonb_build_array(
              jsonb_build_object(
                'entity', 'people',
                'row_number', v_row_number,
                'id', v_person.id,
                'employee_code', v_employee_code,
                'current_version', v_person.version,
                'message', 'El código de trabajador ya existe; actualiza la fila exportada'
              )
            );
            continue;
          end if;
        end if;

        insert into public.people (
          employee_code, name, origin, destination, shift,
          start_date, end_date, baggage, active
        ) values (
          v_employee_code, v_name, v_origin, v_destination, v_shift,
          v_start_date, v_end_date, v_baggage, v_active
        )
        returning id, version into v_id, v_new_version;

        v_people_inserted := v_people_inserted || jsonb_build_array(
          jsonb_build_object(
            'entity', 'people',
            'row_number', v_row_number,
            'id', v_id,
            'employee_code', v_employee_code,
            'version', v_new_version
          )
        );
        continue;
      end if;

      select * into v_person from public.people where id = v_id;
      if not found then
        v_people_conflicts := v_people_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'people',
            'row_number', v_row_number,
            'id', v_id,
            'message', 'La persona ya no existe en FCC TRAVEL'
          )
        );
        continue;
      end if;
      if v_expected_version is null or v_expected_version <> v_person.version then
        v_people_conflicts := v_people_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'people',
            'row_number', v_row_number,
            'id', v_id,
            'expected_version', v_expected_version,
            'current_version', v_person.version,
            'message', 'La persona cambió después de exportar el Excel'
          )
        );
        continue;
      end if;

      if v_person.employee_code is not distinct from v_employee_code
         and v_person.name is not distinct from v_name
         and v_person.origin is not distinct from v_origin
         and v_person.destination is not distinct from v_destination
         and v_person.shift is not distinct from v_shift
         and v_person.start_date is not distinct from v_start_date
         and v_person.end_date is not distinct from v_end_date
         and v_person.baggage is not distinct from v_baggage
         and v_person.active is not distinct from v_active then
        v_people_unchanged := v_people_unchanged || jsonb_build_array(
          jsonb_build_object(
            'row_number', v_row_number,
            'id', v_id,
            'version', v_person.version
          )
        );
        continue;
      end if;

      update public.people
      set employee_code = v_employee_code,
          name = v_name,
          origin = v_origin,
          destination = v_destination,
          shift = v_shift,
          start_date = v_start_date,
          end_date = v_end_date,
          baggage = v_baggage,
          active = v_active
      where id = v_id and version = v_expected_version
      returning version into v_new_version;

      if not found then
        select version into v_current_version from public.people where id = v_id;
        v_people_conflicts := v_people_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'people',
            'row_number', v_row_number,
            'id', v_id,
            'expected_version', v_expected_version,
            'current_version', v_current_version,
            'message', 'La persona cambió durante la sincronización'
          )
        );
        continue;
      end if;

      v_people_updated := v_people_updated || jsonb_build_array(
        jsonb_build_object(
          'row_number', v_row_number,
          'id', v_id,
          'version', v_new_version
        )
      );
    exception when others then
      get stacked diagnostics
        v_error = message_text,
        v_constraint = constraint_name;
      v_people_errors := v_people_errors || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'entity', 'people',
          'row_number', v_row_number,
          'id', coalesce(v_id::text, nullif(trim(coalesce(v_row ->> 'id', v_row ->> 'fccId')), '')),
          'employee_code', nullif(upper(trim(coalesce(v_row ->> 'employee_code', v_row ->> 'codigoPersona'))), ''),
          'message', v_error,
          'constraint', nullif(v_constraint, '')
        ))
      );
    end;
    end loop;

    v_position := 0;
    for v_row in select value from jsonb_array_elements(v_trips_payload)
    loop
    v_position := v_position + 1;
    v_row_number := v_position;
    v_id := null;
    v_expected_version := null;
    v_current_version := null;
    v_person_id := null;
    v_constraint := null;
    begin
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'La fila no es un objeto válido';
      end if;
      if nullif(trim(coalesce(v_row ->> 'row_number', v_row ->> 'rowNumber')), '') is not null then
        v_row_number := coalesce(v_row ->> 'row_number', v_row ->> 'rowNumber')::integer;
      end if;
      if nullif(trim(coalesce(v_row ->> 'id', v_row ->> 'fccId')), '') is not null then
        v_id := coalesce(v_row ->> 'id', v_row ->> 'fccId')::uuid;
      end if;
      if nullif(trim(v_row ->> 'version'), '') is not null then
        v_expected_version := (v_row ->> 'version')::bigint;
      end if;
      if v_id is null and v_expected_version is not null then
        raise exception 'Deja la versión vacía al crear un viaje';
      end if;
      if nullif(trim(coalesce(v_row ->> 'person_id', v_row ->> 'personaId')), '') is not null then
        v_person_id := coalesce(v_row ->> 'person_id', v_row ->> 'personaId')::uuid;
      end if;
      v_person_employee_code := nullif(
        upper(trim(coalesce(v_row ->> 'person_employee_code', v_row ->> 'codigoPersona'))),
        ''
      );
      if v_person_employee_code is not null then
        select id into v_person_id
        from public.people
        where employee_code = v_person_employee_code
          and (v_person_id is null or id = v_person_id);
        if not found then
          raise exception 'No existe una persona con ese código de trabajador';
        end if;
      end if;
      if v_person_id is null then
        raise exception 'Indica el ID o código de la persona';
      end if;

      v_date := nullif(trim(coalesce(v_row ->> 'date', v_row ->> 'fechaViaje')), '')::date;
      v_planned_date := nullif(trim(coalesce(v_row ->> 'planned_date', v_row ->> 'fechaPlanificada')), '')::date;
      v_direction := upper(trim(coalesce(v_row ->> 'direction', v_row ->> 'sentido', '')));
      v_origin := trim(coalesce(v_row ->> 'origin', v_row ->> 'origen', ''));
      v_destination := trim(coalesce(v_row ->> 'destination', v_row ->> 'destino', ''));
      v_requested_time := nullif(trim(coalesce(v_row ->> 'requested_time', v_row ->> 'horaRequerida')), '')::time;
      v_baggage := trim(coalesce(v_row ->> 'baggage', v_row ->> 'equipaje', 'Por confirmar'));
      v_status := trim(coalesce(v_row ->> 'status', v_row ->> 'estado', 'Planificado'));
      v_pnr := trim(coalesce(v_row ->> 'pnr', ''));
      v_flight := trim(coalesce(v_row ->> 'flight', v_row ->> 'vuelo', ''));
      v_amount := nullif(trim(coalesce(v_row ->> 'amount', v_row ->> 'montoClp')), '')::numeric(12,2);
      v_notes := trim(coalesce(v_row ->> 'notes', v_row ->> 'observaciones', ''));
      v_change_reason := trim(coalesce(v_row ->> 'change_reason', v_row ->> 'motivoCambio', ''));

      if v_date is null then
        raise exception 'Completa la fecha del viaje';
      end if;
      if v_direction not in ('SUBIDA', 'BAJADA') then
        raise exception 'El movimiento debe ser SUBIDA o BAJADA';
      end if;
      if v_origin = '' or v_destination = '' then
        raise exception 'Completa origen y destino';
      end if;
      if v_status not in (
        'Planificado', 'Solicitado', 'Emitido',
        'Completado', 'Anulado', 'No presentado'
      ) then
        raise exception 'El estado del viaje no es válido';
      end if;
      if v_baggage not in (
        'Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega'
      ) then
        raise exception 'El equipaje no es válido';
      end if;
      if v_amount is not null and v_amount < 0 then
        raise exception 'El monto no puede ser negativo';
      end if;
      if v_status in ('Emitido', 'Completado', 'No presentado') and v_pnr = '' then
        raise exception 'Registra el código de reserva para este estado';
      end if;

      if v_id is null then
        select * into v_trip
        from public.trips
        where person_id = v_person_id
          and date = v_date
          and direction = v_direction;
        if found then
          v_trips_conflicts := v_trips_conflicts || jsonb_build_array(
            jsonb_build_object(
              'entity', 'trips',
              'row_number', v_row_number,
              'id', v_trip.id,
              'current_version', v_trip.version,
              'message', 'Ese movimiento ya existe para la persona y fecha'
            )
          );
          continue;
        end if;

        if v_planned_date is not null then
          select * into v_trip
          from public.trips
          where person_id = v_person_id
            and planned_date = v_planned_date
            and direction = v_direction;
          if found then
            v_trips_conflicts := v_trips_conflicts || jsonb_build_array(
              jsonb_build_object(
                'entity', 'trips',
                'row_number', v_row_number,
                'id', v_trip.id,
                'current_version', v_trip.version,
                'message', 'Ese movimiento planificado ya existe'
              )
            );
            continue;
          end if;
        end if;

        insert into public.trips (
          person_id, date, planned_date, direction, origin, destination,
          requested_time, baggage, status, pnr, flight, amount, notes
        ) values (
          v_person_id, v_date, coalesce(v_planned_date, v_date), v_direction,
          v_origin, v_destination, v_requested_time, v_baggage, v_status,
          v_pnr, v_flight, v_amount, v_notes
        )
        returning id, version into v_id, v_new_version;

        v_trips_inserted := v_trips_inserted || jsonb_build_array(
          jsonb_build_object(
            'entity', 'trips',
            'row_number', v_row_number,
            'id', v_id,
            'version', v_new_version
          )
        );
        continue;
      end if;

      select * into v_trip from public.trips where id = v_id;
      if not found then
        v_trips_conflicts := v_trips_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'trips',
            'row_number', v_row_number,
            'id', v_id,
            'message', 'El viaje ya no existe en FCC TRAVEL'
          )
        );
        continue;
      end if;
      if v_expected_version is null or v_expected_version <> v_trip.version then
        v_trips_conflicts := v_trips_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'trips',
            'row_number', v_row_number,
            'id', v_id,
            'expected_version', v_expected_version,
            'current_version', v_trip.version,
            'message', 'El viaje cambió después de exportar el Excel'
          )
        );
        continue;
      end if;
      if v_person_id <> v_trip.person_id
         or v_direction <> v_trip.direction
         or v_planned_date is distinct from v_trip.planned_date then
        raise exception 'Conserva la persona, fecha planificada y movimiento del viaje';
      end if;

      if v_trip.date is not distinct from v_date
         and v_trip.origin is not distinct from v_origin
         and v_trip.destination is not distinct from v_destination
         and v_trip.requested_time is not distinct from v_requested_time
         and v_trip.baggage is not distinct from v_baggage
         and v_trip.status is not distinct from v_status
         and v_trip.pnr is not distinct from v_pnr
         and v_trip.flight is not distinct from v_flight
         and v_trip.amount is not distinct from v_amount
         and v_trip.notes is not distinct from v_notes then
        v_trips_unchanged := v_trips_unchanged || jsonb_build_array(
          jsonb_build_object(
            'row_number', v_row_number,
            'id', v_id,
            'version', v_trip.version
          )
        );
        continue;
      end if;
      if v_change_reason = '' then
        raise exception 'Indica el motivo del cambio para actualizar un viaje';
      end if;

      v_notes := concat_ws(
        E'\n',
        nullif(v_notes, ''),
        'Motivo del cambio: ' || v_change_reason
      );

      update public.trips
      set date = v_date,
          origin = v_origin,
          destination = v_destination,
          requested_time = v_requested_time,
          baggage = v_baggage,
          status = v_status,
          pnr = v_pnr,
          flight = v_flight,
          amount = v_amount,
          notes = v_notes
      where id = v_id and version = v_expected_version
      returning version into v_new_version;

      if not found then
        select version into v_current_version from public.trips where id = v_id;
        v_trips_conflicts := v_trips_conflicts || jsonb_build_array(
          jsonb_build_object(
            'entity', 'trips',
            'row_number', v_row_number,
            'id', v_id,
            'expected_version', v_expected_version,
            'current_version', v_current_version,
            'message', 'El viaje cambió durante la sincronización'
          )
        );
        continue;
      end if;

      v_trips_updated := v_trips_updated || jsonb_build_array(
        jsonb_build_object(
          'row_number', v_row_number,
          'id', v_id,
          'version', v_new_version
        )
      );
    exception when others then
      get stacked diagnostics
        v_error = message_text,
        v_constraint = constraint_name;
      v_trips_errors := v_trips_errors || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'entity', 'trips',
          'row_number', v_row_number,
          'id', coalesce(v_id::text, nullif(trim(coalesce(v_row ->> 'id', v_row ->> 'fccId')), '')),
          'message', v_error,
          'constraint', nullif(v_constraint, '')
        ))
      );
    end;
    end loop;

    if jsonb_array_length(v_people_conflicts) > 0
       or jsonb_array_length(v_people_errors) > 0
       or jsonb_array_length(v_trips_conflicts) > 0
       or jsonb_array_length(v_trips_errors) > 0 then
      raise exception using
        errcode = 'ZX001',
        message = 'El lote contiene conflictos o errores';
    end if;
  exception when sqlstate 'ZX001' then
    v_applied := false;
  end;

  v_result := jsonb_build_object(
    'sync_id', p_sync_id,
    'idempotent', false,
    'applied', v_applied,
    'people', jsonb_build_object(
      'inserted', case when v_applied then v_people_inserted else '[]'::jsonb end,
      'updated', case when v_applied then v_people_updated else '[]'::jsonb end,
      'unchanged', v_people_unchanged,
      'conflicts', v_people_conflicts,
      'errors', v_people_errors
    ),
    'trips', jsonb_build_object(
      'inserted', case when v_applied then v_trips_inserted else '[]'::jsonb end,
      'updated', case when v_applied then v_trips_updated else '[]'::jsonb end,
      'unchanged', v_trips_unchanged,
      'conflicts', v_trips_conflicts,
      'errors', v_trips_errors
    )
  );

  update public.sync_runs
  set status = 'completed',
      result = v_result,
      completed_at = clock_timestamp()
  where id = p_sync_id;

  return v_result;
end;
$$;

revoke all on function public.sync_excel_batch(uuid, jsonb) from public;
grant execute on function public.sync_excel_batch(uuid, jsonb) to authenticated;

commit;

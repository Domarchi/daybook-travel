begin;

-- Días de viaje configurables por persona.
--
-- Hasta ahora el 4×3 era lunes y jueves para todo el mundo, grabado a fuego en
-- tres lugares distintos: lib/calendar.ts, generate_pulse() y la función de
-- importación de Excel. Desde aquí los dos días viven en la ficha de cada
-- persona y el único que decide fechas es el motor de lib/cycles.ts.
--
-- Los valores por omisión son lunes y jueves, así que todas las personas que ya
-- están cargadas conservan exactamente el calendario que tenían.
--
-- Aplicada en el proyecto RELEVO el 10 de septiembre de 2026.

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
-- que poder empezar un martes.
--
-- En vez de reescribir las setecientas líneas de sync_excel_batch, se toma su
-- definición actual y se le quitan exactamente esas tres líneas. Así el resto
-- del cuerpo no puede cambiar por accidente, ni por un error de copia.

do $migracion$
declare
  v_def text;
  v_bloque text := '      if v_shift = ''4×3'' and extract(isodow from v_start_date) <> 1 then
        raise exception ''En un turno 4×3, la primera subida debe ser lunes'';
      end if;
';
  v_largo_antes integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sync_excel_batch';

  if v_def is null then
    raise exception 'No existe public.sync_excel_batch';
  end if;

  -- Si la regla ya no está, esta migración ya corrió: no hay nada que hacer.
  if position(v_bloque in v_def) = 0 then
    raise notice 'La regla del lunes ya no estaba; no se toca nada';
    return;
  end if;

  v_largo_antes := length(v_def);

  if (v_largo_antes - length(replace(v_def, v_bloque, ''))) <> length(v_bloque) then
    raise exception 'La regla del lunes aparece más de una vez; no se toca nada';
  end if;

  v_def := replace(v_def, v_bloque, '');

  if length(v_def) <> v_largo_antes - length(v_bloque) then
    raise exception 'El reemplazo cambió más de lo esperado';
  end if;

  execute v_def;
end
$migracion$;

revoke all on function public.sync_excel_batch(uuid, jsonb) from public;
grant execute on function public.sync_excel_batch(uuid, jsonb) to authenticated;

commit;

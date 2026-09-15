begin;

-- "Sin turno" es una configuración válida para jefaturas y viajes
-- ocasionales. Sus movimientos se agregan manualmente y nunca se generan como
-- un ciclo 4×3 o 10×10.

alter table public.people drop constraint if exists people_shift_check;
alter table public.people add constraint people_shift_check
  check (shift in ('Por confirmar', '4×3', '10×10', 'Sin turno'));

-- La sincronización de Excel valida el mismo vocabulario dentro de su función.
-- Se modifica solo ese bloque para conservar intactas las reglas de auditoría,
-- concurrencia y permisos que ya tiene la función aplicada.
do $migracion$
declare
  v_def text;
  v_condicion_anterior text := 'if v_shift not in (''Por confirmar'', ''4×3'', ''10×10'') then';
  v_condicion_nueva text := 'if v_shift not in (''Por confirmar'', ''4×3'', ''10×10'', ''Sin turno'') then';
  v_mensaje_anterior text := 'El turno debe ser Por confirmar, 4×3 o 10×10';
  v_mensaje_nuevo text := 'El turno debe ser Por confirmar, 4×3, 10×10 o Sin turno';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sync_excel_batch';

  if v_def is null then
    raise exception 'No existe public.sync_excel_batch';
  end if;

  if position(v_condicion_nueva in v_def) > 0 then
    raise notice 'La sincronización ya acepta Sin turno';
    return;
  end if;

  if position(v_condicion_anterior in v_def) = 0 then
    raise exception 'No se encontró la validación de turno esperada; no se toca la función';
  end if;

  v_def := replace(v_def, v_condicion_anterior, v_condicion_nueva);
  v_def := replace(v_def, v_mensaje_anterior, v_mensaje_nuevo);
  execute v_def;
end
$migracion$;

revoke all on function public.sync_excel_batch(uuid, jsonb) from public;
grant execute on function public.sync_excel_batch(uuid, jsonb) to authenticated;

commit;

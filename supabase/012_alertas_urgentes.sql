begin;

-- Avisos diarios de viajes por comprar.
--
-- Un proceso programado (el cron de Vercel) lee desde aquí los viajes sin código
-- de reserva que vuelan pronto o que ya volaron, y manda un correo. Ese proceso
-- no tiene una persona detrás ni sesión de usuario, así que NO pasa por las
-- políticas de las tablas: llama a esta única función, que solo puede ejecutar
-- la llave de servicio y que devuelve lo mínimo para armar el aviso.
--
-- Las reglas de urgente y vencido NO se repiten aquí: viven en lib/purchase.ts
-- y se aplican en TypeScript sobre estos datos. Esta función solo acota la
-- consulta (nada anulado, nada con PNR, de hace 14 días a la ventana de compra)
-- y entrega la fecha de hoy en Santiago y la ventana vigente, para que el aviso
-- y la agenda coincidan.
--
-- No escribe nada, así que no hay nada que auditar.

create or replace function public.purchase_alert_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ajustes as (
    select
      (now() at time zone 'America/Santiago')::date as hoy,
      coalesce((select s.purchase_window_days from public.settings s limit 1), 21) as ventana
  )
  select jsonb_build_object(
    'hoy', a.hoy,
    'ventana', a.ventana,
    'viajes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'persona', p.name,
          'fecha', t.date,
          'sentido', t.direction,
          'origen', t.origin,
          'destino', t.destination,
          'estado', t.status,
          'hora', to_char(t.requested_time, 'HH24:MI')
        )
        order by t.date, p.name
      )
      from public.trips t
      join public.people p on p.id = t.person_id
      where t.status <> 'Anulado'
        and length(trim(t.pnr)) = 0
        and t.date >= a.hoy - 14
        and t.date <= a.hoy + a.ventana
    ), '[]'::jsonb)
  )
  from ajustes a;
$$;

revoke all on function public.purchase_alert_data() from public, anon, authenticated;
grant execute on function public.purchase_alert_data() to service_role;

commit;

begin;

-- Retira generate_pulse().
--
-- Desde que lib/cycles.ts es el único motor de fechas (migración 005 y rama
-- `motor-de-ciclos`), la aplicación inserta los viajes con upsert e
-- ignoreDuplicates y nadie llama a esta función. Era además la que tenía el
-- lunes y el jueves grabados a fuego y solo sabía generar el 4×3, así que dejarla
-- invitaba a usar un calendario que ya no es el de verdad.
--
-- No se pierde nada: la función solo insertaba viajes nuevos, no guardaba datos.
-- Si hiciera falta volver atrás, su definición sigue en 001 y 002.
drop function if exists public.generate_pulse(uuid, date);

commit;

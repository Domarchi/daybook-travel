begin;

-- La ventana de compra («Anticipación») la cambia solo un administrador.
--
-- Decisión del dueño de noviembre de 2026: es política de la obra y vale para
-- todo el equipo, así que no la cambia cualquier miembro. La pantalla ya lo
-- respetaba (`puedeCambiarVentana` en lib/purchase.ts), pero la base dejaba
-- escribir a cualquier miembro (`settings_update` de la 006 usaba is_member()).
-- Desde aquí, la base lo exige.
--
-- Leer sigue igual (`settings_read`, is_member()) y el trigger settings_audit
-- sigue dejando cada cambio en el historial. Un miembro común que intente
-- escribir no recibe error: el UPDATE no encuentra filas visibles y no cambia
-- nada; el cliente lo convierte en «No se pudo guardar la ventana de compra:
-- solo un administrador la cambia.».

drop policy if exists settings_update on public.settings;

create policy settings_update on public.settings
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());

commit;

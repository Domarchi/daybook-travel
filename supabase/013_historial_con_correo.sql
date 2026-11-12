begin;

-- Quién hizo cada cambio, con su correo y no con un número.
--
-- El historial guarda al autor como `auth.uid()` (un uuid), y la pantalla
-- mostraba "Usuario 8e890f29": para Katy y Tamara eso no dice quién fue. El
-- correo vive en `auth.users`, que el navegador no puede leer, así que esta
-- función lo traduce.
--
-- No cambia nada de lo guardado: el historial sigue siendo lo que era y la
-- traducción vale también para los cambios viejos.
--
-- Qué devuelve y a quién:
--   * Solo a un miembro activo. Sin acceso, nada (falla cerrado, como todo).
--   * Solo correos de quienes aparecen como autores en una parte del historial
--     que quien pregunta ya puede leer. El historial de accesos lo lee solo un
--     administrador (migración 009), así que alguien que solo cambió accesos no
--     se le revela a un miembro común. Pedir un uuid cualquiera no sirve para
--     averiguar el correo de otra cuenta de Daybook.
create or replace function public.history_actors(p_ids uuid[])
returns table (id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select u.id, lower(u.email::text)
  from auth.users u
  where public.is_member()
    and u.id = any(p_ids)
    and exists (
      select 1
      from public.history h
      where h.actor = u.id
        and (h.entity <> 'members' or public.is_admin())
    );
$$;

revoke all on function public.history_actors(uuid[]) from public, anon;
grant execute on function public.history_actors(uuid[]) to authenticated;

commit;

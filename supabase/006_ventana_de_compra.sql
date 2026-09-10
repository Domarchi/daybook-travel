begin;

-- La ventana de compra: con cuántos días de anticipación se compran los pasajes.
--
-- Hasta ahora la aplicación mostraba todos los viajes futuros como
-- "Planificado", sin distinguir el que sale el lunes del que sale en marzo.
-- Este número es lo que le permite responder la pregunta del día: ¿qué hay que
-- comprar hoy?
--
-- Es una política de la obra, no una preferencia de cada persona, así que vive
-- en la base y no en el navegador: lo que cambie Katy lo ve Tamara.

create table if not exists public.settings (
  id uuid primary key
    default '00000000-0000-0000-0000-000000000001'
    check (id = '00000000-0000-0000-0000-000000000001'),
  purchase_window_days smallint not null default 21,
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Ajustes de la obra. Una sola fila: el check del id lo garantiza.';
comment on column public.settings.purchase_window_days is
  'Días de anticipación con que se compran los pasajes. Un viaje sin código de reserva que vuela dentro de esta ventana aparece como urgente.';

alter table public.settings
  drop constraint if exists settings_window_check;
alter table public.settings
  add constraint settings_window_check
  check (purchase_window_days between 1 and 120);

insert into public.settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

alter table public.settings enable row level security;

-- Se puede leer y modificar, nunca crear ni borrar: la fila es una sola y ya
-- existe. Es la misma lista blanca que gobierna el resto del sistema.
drop policy if exists settings_read on public.settings;
drop policy if exists settings_update on public.settings;

create policy settings_read on public.settings
  for select to authenticated using (public.is_member());
create policy settings_update on public.settings
  for update to authenticated using (public.is_member())
  with check (public.is_member());

-- Cambiar la ventana afecta a todo el mundo, así que queda auditado como
-- cualquier otra escritura del sistema.
drop trigger if exists settings_audit on public.settings;
create trigger settings_audit
  after insert or update on public.settings
  for each row execute function public.audit_change();

commit;

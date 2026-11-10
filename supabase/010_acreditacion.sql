begin;

-- Acreditación: los documentos que una persona debe tener al día para entrar a
-- un manifiesto.
--
-- Qué documentos cuentan no está escrito en el código: es una tabla
-- (`document_types`) que un administrador mantiene desde la aplicación. Cada
-- persona tiene, por cada tipo, una fecha de vencimiento (`person_documents`).
--
-- Reglas de siempre:
--   * Nadie borra nada. Un tipo que ya no se exige se desactiva; un documento
--     sin fecha queda en null (= sin registrar), no se elimina la fila.
--   * Toda escritura queda en `history`, con quién la hizo.
--   * Quién define los tipos lo decide la base, no la pantalla: solo un
--     administrador. Cargar las fechas de cada persona la hace cualquier miembro.
--
-- Este archivo solo guarda los datos. Si falta un documento o está vencido para
-- la fecha del viaje lo calcula `lib/accreditation.ts`, que muestra el motivo en
-- el manifiesto; no hay nada aquí que impida guardar un viaje.

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- "Examen médico" y "examen médico " son el mismo documento.
create unique index if not exists document_types_name_key
  on public.document_types (lower(trim(name)));

create table if not exists public.person_documents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  type_id uuid not null references public.document_types(id),
  -- null = el documento no está registrado todavía.
  expires_on date,
  created_at timestamptz not null default now(),
  unique (person_id, type_id)
);

create index if not exists person_documents_type_idx
  on public.person_documents (type_id);

alter table public.document_types enable row level security;
alter table public.person_documents enable row level security;

drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types
  for select to authenticated using (public.is_member());

drop policy if exists document_types_insert on public.document_types;
create policy document_types_insert on public.document_types
  for insert to authenticated with check (public.is_admin());

drop policy if exists document_types_update on public.document_types;
create policy document_types_update on public.document_types
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists person_documents_read on public.person_documents;
create policy person_documents_read on public.person_documents
  for select to authenticated using (public.is_member());

drop policy if exists person_documents_insert on public.person_documents;
create policy person_documents_insert on public.person_documents
  for insert to authenticated with check (public.is_member());

drop policy if exists person_documents_update on public.person_documents;
create policy person_documents_update on public.person_documents
  for update to authenticated
  using (public.is_member()) with check (public.is_member());

-- Sin DELETE para nadie: no hay política ni permiso.
revoke all on public.document_types, public.person_documents from anon, authenticated;
grant select, insert, update on public.document_types, public.person_documents to authenticated;

drop trigger if exists document_types_audit on public.document_types;
create trigger document_types_audit
  after insert or update on public.document_types
  for each row execute function public.audit_change();

drop trigger if exists person_documents_audit on public.person_documents;
create trigger person_documents_audit
  after insert or update on public.person_documents
  for each row execute function public.audit_change();

commit;

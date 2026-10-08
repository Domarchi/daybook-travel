begin;

-- B2 is intentionally separate from the wider Excel/admin update surface.
-- A receipt owns an idempotency key globally, so a key can never replay a
-- proposal for another trip or another member.
create table if not exists public.trip_proposal_receipts (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id),
  actor uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$'),
  expected_version bigint not null check (expected_version >= 0),
  applied_version bigint not null check (applied_version >= 0),
  proposal_identity jsonb not null check (jsonb_typeof(proposal_identity) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (idempotency_key)
);

alter table public.trip_proposal_receipts enable row level security;
revoke all on public.trip_proposal_receipts from public, anon, authenticated;

create or replace function public.reject_trip_proposal_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los receipts de propuestas son append-only';
end;
$$;

drop trigger if exists trip_proposal_receipts_append_only on public.trip_proposal_receipts;
create trigger trip_proposal_receipts_append_only
before update or delete on public.trip_proposal_receipts
for each row execute function public.reject_trip_proposal_receipt_mutation();

create or replace function public.apply_trip_proposal(
  p_trip_id uuid,
  p_expected_version bigint,
  p_proposal jsonb,
  p_proposal_identity jsonb,
  p_idempotency_key text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_receipt public.trip_proposal_receipts%rowtype;
  v_key text;
  v_result jsonb;
begin
  -- Membership is the workspace ownership model for shared trips. Receipts
  -- additionally belong to their creator and cannot be replayed by a peer.
  if v_actor is null or not public.is_member() then
    raise exception 'no_autorizado';
  end if;
  if p_trip_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'version_requerida';
  end if;
  if p_confirmed is distinct from true then
    raise exception 'confirmacion_requerida';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception 'idempotency_key_invalida';
  end if;
  if jsonb_typeof(p_proposal) <> 'object' or p_proposal = '{}'::jsonb then
    raise exception 'propuesta_invalida';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_proposal) as k(key)
    where k.key not in ('date', 'requested_time', 'baggage', 'notes')
  ) then
    raise exception 'campo_no_permitido';
  end if;
  -- JSONB equality is order-independent, binding the receipt identity to the
  -- exact canonical allowlisted proposal rather than arbitrary client text.
  if jsonb_typeof(p_proposal_identity) <> 'object' or p_proposal_identity <> p_proposal then
    raise exception 'identidad_propuesta_invalida';
  end if;
  if p_proposal ? 'date' and (
    jsonb_typeof(p_proposal -> 'date') <> 'string'
    or p_proposal ->> 'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or to_char(to_date(p_proposal ->> 'date', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> p_proposal ->> 'date'
  ) then raise exception 'propuesta_invalida'; end if;
  if p_proposal ? 'requested_time' and (
    jsonb_typeof(p_proposal -> 'requested_time') not in ('string', 'null')
    or (jsonb_typeof(p_proposal -> 'requested_time') = 'string' and p_proposal ->> 'requested_time' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$')
  ) then raise exception 'propuesta_invalida'; end if;
  if p_proposal ? 'baggage' and (
    jsonb_typeof(p_proposal -> 'baggage') <> 'string'
    or p_proposal ->> 'baggage' not in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega')
  ) then raise exception 'propuesta_invalida'; end if;
  if p_proposal ? 'notes' and (
    jsonb_typeof(p_proposal -> 'notes') <> 'string'
    or length(p_proposal ->> 'notes') > 2000
  ) then raise exception 'propuesta_invalida'; end if;

  -- Serializes duplicate submissions before checking/inserting the unique key,
  -- avoiding a uniqueness race that could otherwise roll back the trip update.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into v_receipt
  from public.trip_proposal_receipts
  where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor <> v_actor or v_receipt.trip_id <> p_trip_id
      or v_receipt.expected_version <> p_expected_version
      or v_receipt.proposal_identity <> p_proposal_identity then
      raise exception 'idempotency_key_reused';
    end if;
    select * into v_trip from public.trips where id = p_trip_id;
    if not found then raise exception 'trip_no_encontrado'; end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'trip', jsonb_build_object('id', v_trip.id, 'version', v_trip.version, 'date', v_trip.date,
        'requested_time', v_trip.requested_time, 'baggage', v_trip.baggage, 'notes', v_trip.notes),
      'receipt', jsonb_build_object('idempotency_key', v_receipt.idempotency_key,
        'proposal_identity', v_receipt.proposal_identity, 'applied_version', v_receipt.applied_version)
    );
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then raise exception 'trip_no_encontrado'; end if;
  if v_trip.version <> p_expected_version then raise exception 'version_obsoleta'; end if;

  update public.trips
  set date = case when p_proposal ? 'date' then (p_proposal ->> 'date')::date else v_trip.date end,
      requested_time = case when p_proposal ? 'requested_time' then nullif(p_proposal ->> 'requested_time', '')::time else v_trip.requested_time end,
      baggage = case when p_proposal ? 'baggage' then p_proposal ->> 'baggage' else v_trip.baggage end,
      notes = case when p_proposal ? 'notes' then p_proposal ->> 'notes' else v_trip.notes end
  where id = v_trip.id
  returning * into v_trip;

  insert into public.trip_proposal_receipts (
    trip_id, actor, idempotency_key, expected_version, applied_version, proposal_identity
  ) values (
    v_trip.id, v_actor, p_idempotency_key, p_expected_version, v_trip.version, p_proposal_identity
  ) returning * into v_receipt;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'trip', jsonb_build_object('id', v_trip.id, 'version', v_trip.version, 'date', v_trip.date,
      'requested_time', v_trip.requested_time, 'baggage', v_trip.baggage, 'notes', v_trip.notes),
    'receipt', jsonb_build_object('idempotency_key', v_receipt.idempotency_key,
      'proposal_identity', v_receipt.proposal_identity, 'applied_version', v_receipt.applied_version)
  );
end;
$$;

revoke all on function public.apply_trip_proposal(uuid, bigint, jsonb, jsonb, text, boolean) from public;
grant execute on function public.apply_trip_proposal(uuid, bigint, jsonb, jsonb, text, boolean) to authenticated;

commit;

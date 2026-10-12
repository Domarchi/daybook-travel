begin;

-- The allowlist is intentionally populated out of band. A queue worker is an
-- authenticated Supabase user but never a travel member and receives no table
-- privileges, so it cannot discover trips or requesters.
create table if not exists public.trip_ai_workers (
  user_id uuid primary key
);

create table if not exists public.trip_ai_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'guided' check (kind in ('guided', 'import_mapping')),
  trip_id uuid null references public.trips(id),
  actor uuid not null,
  request jsonb not null check (coalesce(
    (kind = 'guided' and
    jsonb_typeof(request) = 'object'
    and request ?& array['schema', 'action', 'value', 'current']
    and request - 'schema' - 'action' - 'value' - 'current' = '{}'::jsonb
    and request ->> 'schema' = 'travel-guided-v1'
    and request ->> 'action' in ('requested_time', 'date', 'baggage')
    and jsonb_typeof(request -> 'current') = 'object'
    and request -> 'current' ?& array['date', 'requested_time', 'baggage']
    and request -> 'current' - 'date' - 'requested_time' - 'baggage' = '{}'::jsonb
    and jsonb_typeof(request -> 'current' -> 'date') = 'string'
    and request -> 'current' ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and to_char(to_date(request -> 'current' ->> 'date', 'YYYY-MM-DD'), 'YYYY-MM-DD') = request -> 'current' ->> 'date'
    and jsonb_typeof(request -> 'current' -> 'requested_time') in ('string', 'null')
    and (jsonb_typeof(request -> 'current' -> 'requested_time') = 'null' or request -> 'current' ->> 'requested_time' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$')
    and jsonb_typeof(request -> 'current' -> 'baggage') = 'string'
    and request -> 'current' ->> 'baggage' in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega')
    and (
      (request ->> 'action' = 'date' and jsonb_typeof(request -> 'value') = 'string'
        and request ->> 'value' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and to_char(to_date(request ->> 'value', 'YYYY-MM-DD'), 'YYYY-MM-DD') = request ->> 'value')
      or (request ->> 'action' = 'requested_time' and jsonb_typeof(request -> 'value') = 'string'
        and request ->> 'value' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$')
      or (request ->> 'action' = 'baggage' and jsonb_typeof(request -> 'value') = 'string'
        and request ->> 'value' in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega'))
    )) or (kind = 'import_mapping'
      and jsonb_typeof(request) = 'object'
      and request ?& array['schema', 'entity', 'headers', 'samples']
      and request - 'schema' - 'entity' - 'headers' - 'samples' = '{}'::jsonb
      and request ->> 'schema' = 'travel-import-map-v1'
      and request ->> 'entity' in ('people', 'trips')
      and jsonb_typeof(request -> 'headers') = 'array'
      and jsonb_array_length(request -> 'headers') between 1 and 40
      and not exists (select 1 from jsonb_array_elements_text(request -> 'headers') h where length(h.value) not between 1 and 80)
      and (select count(*) = count(distinct h.value) from jsonb_array_elements_text(request -> 'headers') h)
      and jsonb_typeof(request -> 'samples') = 'array'
      and jsonb_array_length(request -> 'samples') between 0 and 3
      and not exists (select 1 from jsonb_array_elements(request -> 'samples') s where jsonb_typeof(s.value) <> 'array' or jsonb_array_length(s.value) <> jsonb_array_length(request -> 'headers') or exists (select 1 from jsonb_array_elements(s.value) c where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 24))
    ), false)),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'failed', 'expired')),
  proposal jsonb null check (proposal is null or coalesce(
    (kind = 'guided' and jsonb_typeof(proposal) = 'object' and proposal = jsonb_build_object(request ->> 'action', request -> 'value'))
    or (kind = 'import_mapping' and jsonb_typeof(proposal) = 'object' and proposal ?& array['mapping'] and proposal - 'mapping' = '{}'::jsonb
      and jsonb_typeof(proposal -> 'mapping') = 'object'
      and (select count(*) = jsonb_array_length(request -> 'headers') from jsonb_object_keys(proposal -> 'mapping'))
      and not exists (select 1 from jsonb_object_keys(proposal -> 'mapping') k where not exists (select 1 from jsonb_array_elements_text(request -> 'headers') h where h.value = k.key))
      and not exists (select 1 from jsonb_each(proposal -> 'mapping') m where jsonb_typeof(m.value) not in ('string', 'null') or (jsonb_typeof(m.value) = 'string' and not ((request ->> 'entity' = 'people' and (m.value #>> '{}') in ('daybookId','codigoPersona','nombreCompleto','origen','destino','turno','fechaInicio','fechaTermino','equipaje','activa','version')) or (request ->> 'entity' = 'trips' and (m.value #>> '{}') in ('daybookId','personaId','codigoPersona','persona','fechaPlanificada','fechaViaje','sentido','origen','destino','horaRequerida','equipaje','estado','pnr','vuelo','montoClp','observaciones','motivoCambio','version')))))
      and (select count(*) = count(distinct m.value #>> '{}') from jsonb_each(proposal -> 'mapping') m where jsonb_typeof(m.value) = 'string')
    ), false)),
  check ((kind = 'guided' and trip_id is not null) or (kind = 'import_mapping' and trip_id is null)),
  diagnostic text null check (diagnostic is null or diagnostic in ('model_unavailable', 'timeout', 'model_response_invalid', 'expired', 'worker_error')),
  attempts int not null default 0 check (attempts >= 0),
  claimed_by uuid null,
  created_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz null,
  completed_at timestamptz null
);

create index if not exists trip_ai_requests_actor_status_idx
  on public.trip_ai_requests (actor, status, created_at);
create index if not exists trip_ai_requests_claim_idx
  on public.trip_ai_requests (status, created_at);

alter table public.trip_ai_workers enable row level security;
alter table public.trip_ai_requests enable row level security;
revoke all on public.trip_ai_workers from public, anon, authenticated;
revoke all on public.trip_ai_requests from public, anon, authenticated;

create or replace function public.request_trip_ai_proposal(p_trip_id uuid, p_request jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_member() then
    raise exception 'no_autorizado';
  end if;
  if p_trip_id is null or not coalesce(
    jsonb_typeof(p_request) = 'object'
    and p_request ?& array['schema', 'action', 'value', 'current']
    and p_request - 'schema' - 'action' - 'value' - 'current' = '{}'::jsonb
    and p_request ->> 'schema' = 'travel-guided-v1'
    and p_request ->> 'action' in ('requested_time', 'date', 'baggage')
    and jsonb_typeof(p_request -> 'current') = 'object'
    and p_request -> 'current' ?& array['date', 'requested_time', 'baggage']
    and p_request -> 'current' - 'date' - 'requested_time' - 'baggage' = '{}'::jsonb
    and jsonb_typeof(p_request -> 'current' -> 'date') = 'string'
    and p_request -> 'current' ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and to_char(to_date(p_request -> 'current' ->> 'date', 'YYYY-MM-DD'), 'YYYY-MM-DD') = p_request -> 'current' ->> 'date'
    and jsonb_typeof(p_request -> 'current' -> 'requested_time') in ('string', 'null')
    and (jsonb_typeof(p_request -> 'current' -> 'requested_time') = 'null' or p_request -> 'current' ->> 'requested_time' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$')
    and jsonb_typeof(p_request -> 'current' -> 'baggage') = 'string'
    and p_request -> 'current' ->> 'baggage' in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega')
    and (
      (p_request ->> 'action' = 'date' and jsonb_typeof(p_request -> 'value') = 'string' and p_request ->> 'value' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and to_char(to_date(p_request ->> 'value', 'YYYY-MM-DD'), 'YYYY-MM-DD') = p_request ->> 'value')
      or (p_request ->> 'action' = 'requested_time' and jsonb_typeof(p_request -> 'value') = 'string' and p_request ->> 'value' ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$')
      or (p_request ->> 'action' = 'baggage' and jsonb_typeof(p_request -> 'value') = 'string' and p_request ->> 'value' in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega'))
    ), false) then
    raise exception 'solicitud_invalida';
  end if;
  if not exists (select 1 from public.trips where id = p_trip_id) then
    raise exception 'trip_no_encontrado';
  end if;
  -- Serializes this member's queue depth so concurrent browser clicks cannot
  -- both observe four pending requests and exceed the five-request ceiling.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  if (select count(*) from public.trip_ai_requests where actor = v_actor and status in ('pending', 'claimed')) >= 5 then
    raise exception 'rate_limited';
  end if;
  insert into public.trip_ai_requests (trip_id, actor, request)
  values (p_trip_id, v_actor, p_request)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.request_trip_import_mapping(p_request jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_member() then raise exception 'no_autorizado'; end if;
  if not coalesce(jsonb_typeof(p_request) = 'object'
    and p_request ?& array['schema', 'entity', 'headers', 'samples']
    and p_request - 'schema' - 'entity' - 'headers' - 'samples' = '{}'::jsonb
    and p_request ->> 'schema' = 'travel-import-map-v1'
    and p_request ->> 'entity' in ('people', 'trips')
    and jsonb_typeof(p_request -> 'headers') = 'array'
    and jsonb_array_length(p_request -> 'headers') between 1 and 40
    and not exists (select 1 from jsonb_array_elements_text(p_request -> 'headers') h where length(h.value) not between 1 and 80)
    and (select count(*) = count(distinct h.value) from jsonb_array_elements_text(p_request -> 'headers') h)
    and jsonb_typeof(p_request -> 'samples') = 'array' and jsonb_array_length(p_request -> 'samples') between 0 and 3
    and not exists (select 1 from jsonb_array_elements(p_request -> 'samples') s where jsonb_typeof(s.value) <> 'array' or jsonb_array_length(s.value) <> jsonb_array_length(p_request -> 'headers') or exists (select 1 from jsonb_array_elements(s.value) c where jsonb_typeof(c.value) <> 'string' or length(c.value #>> '{}') > 24)), false) then
    raise exception 'solicitud_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  if (select count(*) from public.trip_ai_requests where actor = v_actor and status in ('pending', 'claimed')) >= 5 then raise exception 'rate_limited'; end if;
  insert into public.trip_ai_requests (kind, trip_id, actor, request) values ('import_mapping', null, v_actor, p_request) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_trip_ai_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.trip_ai_requests%rowtype;
begin
  if v_actor is null then raise exception 'no_autorizado'; end if;
  select * into v_request from public.trip_ai_requests where id = p_id and actor = v_actor for update;
  if not found then raise exception 'no_autorizado'; end if;
  if v_request.status in ('pending', 'claimed') and v_request.created_at < now() - case when v_request.kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end then
    update public.trip_ai_requests
    set status = 'expired', diagnostic = 'expired', completed_at = clock_timestamp()
    where id = v_request.id
    returning * into v_request;
  end if;
  return jsonb_build_object('id', v_request.id, 'status', v_request.status,
    'proposal', v_request.proposal, 'diagnostic', v_request.diagnostic);
end;
$$;

create or replace function public.claim_trip_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.trip_ai_requests%rowtype;
begin
  if v_actor is null or not exists (select 1 from public.trip_ai_workers where user_id = v_actor) then
    raise exception 'no_autorizado';
  end if;
  select * into v_request
  from public.trip_ai_requests
  where created_at >= now() - case when kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end
    and (status = 'pending' or (status = 'claimed' and claimed_at < now() - interval '30 seconds' and attempts < 3))
  order by created_at
  for update skip locked
  limit 1;
  if not found then return null; end if;
  update public.trip_ai_requests
  set status = 'claimed', attempts = v_request.attempts + 1, claimed_by = v_actor, claimed_at = clock_timestamp()
  where id = v_request.id
  returning * into v_request;
  return jsonb_build_object('id', v_request.id, 'kind', v_request.kind, 'request', v_request.request);
end;
$$;

create or replace function public.complete_trip_ai_request(p_id uuid, p_proposal jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.trip_ai_requests%rowtype;
begin
  if v_actor is null or not exists (select 1 from public.trip_ai_workers where user_id = v_actor) then
    raise exception 'no_autorizado';
  end if;
  select * into v_request from public.trip_ai_requests where id = p_id for update;
  if not found or v_request.status <> 'claimed' or v_request.claimed_by <> v_actor then
    raise exception 'request_not_claimed';
  end if;
  if (v_request.kind = 'guided' and (jsonb_typeof(p_proposal) <> 'object' or p_proposal <> jsonb_build_object(v_request.request ->> 'action', v_request.request -> 'value')))
    or (v_request.kind = 'import_mapping' and not (p_proposal is not null and exists (select 1 from public.trip_ai_requests where id = v_request.id and proposal is null) and coalesce(
      jsonb_typeof(p_proposal) = 'object' and p_proposal ?& array['mapping'] and p_proposal - 'mapping' = '{}'::jsonb
      and jsonb_typeof(p_proposal -> 'mapping') = 'object'
      and (select count(*) = jsonb_array_length(v_request.request -> 'headers') from jsonb_object_keys(p_proposal -> 'mapping'))
      and not exists (select 1 from jsonb_object_keys(p_proposal -> 'mapping') k where not exists (select 1 from jsonb_array_elements_text(v_request.request -> 'headers') h where h.value = k.key))
      and not exists (select 1 from jsonb_each(p_proposal -> 'mapping') m where jsonb_typeof(m.value) not in ('string', 'null') or (jsonb_typeof(m.value) = 'string' and not ((v_request.request ->> 'entity' = 'people' and (m.value #>> '{}') in ('daybookId','codigoPersona','nombreCompleto','origen','destino','turno','fechaInicio','fechaTermino','equipaje','activa','version')) or (v_request.request ->> 'entity' = 'trips' and (m.value #>> '{}') in ('daybookId','personaId','codigoPersona','persona','fechaPlanificada','fechaViaje','sentido','origen','destino','horaRequerida','equipaje','estado','pnr','vuelo','montoClp','observaciones','motivoCambio','version')))))
      and (select count(*) = count(distinct m.value #>> '{}') from jsonb_each(p_proposal -> 'mapping') m where jsonb_typeof(m.value) = 'string'), false))) then
    raise exception 'model_response_invalid';
  end if;
  update public.trip_ai_requests
  set status = 'done', proposal = p_proposal, diagnostic = null, completed_at = clock_timestamp()
  where id = v_request.id;
end;
$$;

create or replace function public.fail_trip_ai_request(p_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.trip_ai_requests%rowtype;
begin
  if v_actor is null or not exists (select 1 from public.trip_ai_workers where user_id = v_actor) then
    raise exception 'no_autorizado';
  end if;
  if p_code is null or p_code not in ('model_unavailable', 'timeout', 'model_response_invalid', 'expired', 'worker_error') then
    raise exception 'invalid_diagnostic';
  end if;
  select * into v_request from public.trip_ai_requests where id = p_id for update;
  if not found or v_request.status <> 'claimed' or v_request.claimed_by <> v_actor then
    raise exception 'request_not_claimed';
  end if;
  update public.trip_ai_requests
  set status = 'failed', diagnostic = p_code, completed_at = clock_timestamp()
  where id = v_request.id;
end;
$$;

revoke all on function public.request_trip_ai_proposal(uuid, jsonb) from public;
revoke all on function public.request_trip_import_mapping(jsonb) from public;
revoke all on function public.get_trip_ai_request(uuid) from public;
revoke all on function public.claim_trip_ai_request() from public;
revoke all on function public.complete_trip_ai_request(uuid, jsonb) from public;
revoke all on function public.fail_trip_ai_request(uuid, text) from public;
grant execute on function public.request_trip_ai_proposal(uuid, jsonb) to authenticated;
grant execute on function public.request_trip_import_mapping(jsonb) to authenticated;
grant execute on function public.get_trip_ai_request(uuid) to authenticated;
grant execute on function public.claim_trip_ai_request() to authenticated;
grant execute on function public.complete_trip_ai_request(uuid, jsonb) to authenticated;
grant execute on function public.fail_trip_ai_request(uuid, text) to authenticated;

commit;

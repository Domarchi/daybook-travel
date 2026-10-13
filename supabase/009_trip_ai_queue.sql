begin;

-- import_mapping: UTF-8 octet lengths, headers 1..80, <=40 headers;
-- <=3 samples, each 0..24 bytes, printable ASCII only. Letters x/X, digits 9.
-- Headers remain Unicode labels reviewed and confirmed locally by the user.

-- The allowlist is intentionally populated out of band. A queue worker is an
-- authenticated Supabase user but never a travel member and receives no table
-- privileges, so it cannot discover trips or requesters.
create or replace function public.trip_ai_request_is_valid(p_kind text, p_request jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(case p_kind
    when 'guided' then
      jsonb_typeof(p_request) = 'object'
      and p_request ?& array['schema', 'action', 'value', 'current']
      and p_request - 'schema' - 'action' - 'value' - 'current' = '{}'::jsonb
      and (p_request ->> 'schema') = 'travel-guided-v1'
      and (p_request ->> 'action') in ('requested_time', 'date', 'baggage')
      and jsonb_typeof(p_request -> 'current') = 'object'
      and (p_request -> 'current') ?& array['date', 'requested_time', 'baggage']
      and ((p_request -> 'current') - 'date' - 'requested_time' - 'baggage') = '{}'::jsonb
      and case
        when jsonb_typeof((p_request -> 'current') -> 'date') = 'string'
          and (((p_request -> 'current') ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        then to_char(to_date(((p_request -> 'current') ->> 'date'), 'YYYY-MM-DD'), 'YYYY-MM-DD') = ((p_request -> 'current') ->> 'date')
        else false
      end
      and jsonb_typeof((p_request -> 'current') -> 'requested_time') in ('string', 'null')
      and (jsonb_typeof((p_request -> 'current') -> 'requested_time') = 'null' or (((p_request -> 'current') ->> 'requested_time') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'))
      and jsonb_typeof((p_request -> 'current') -> 'baggage') = 'string'
      and ((p_request -> 'current') ->> 'baggage') in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega')
      and case (p_request ->> 'action')
        when 'date' then case
          when jsonb_typeof(p_request -> 'value') = 'string'
            and ((p_request ->> 'value') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
          then to_char(to_date((p_request ->> 'value'), 'YYYY-MM-DD'), 'YYYY-MM-DD') = (p_request ->> 'value')
          else false
        end
        when 'requested_time' then jsonb_typeof(p_request -> 'value') = 'string'
          and ((p_request ->> 'value') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
        when 'baggage' then jsonb_typeof(p_request -> 'value') = 'string'
          and (p_request ->> 'value') in ('Por confirmar', 'Mochila', 'Maleta de cabina', 'Maleta en bodega')
        else false
      end
    when 'import_mapping' then
      jsonb_typeof(p_request) = 'object'
      and p_request ?& array['schema', 'entity', 'headers', 'samples']
      and p_request - 'schema' - 'entity' - 'headers' - 'samples' = '{}'::jsonb
      and (p_request ->> 'schema') = 'travel-import-map-v1'
      and (p_request ->> 'entity') in ('people', 'trips')
      and jsonb_typeof(p_request -> 'headers') = 'array'
      and jsonb_array_length((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) between 1 and 40
      and not exists (select 1 from jsonb_array_elements((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) AS h(value) where jsonb_typeof(h.value) <> 'string' or octet_length((h.value #>> '{}')) not between 1 and 80)
      and (select count(*) = count(distinct (h.value #>> '{}')) from jsonb_array_elements((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) AS h(value))
      and jsonb_typeof(p_request -> 'samples') = 'array'
      and jsonb_array_length((case when jsonb_typeof(p_request -> 'samples') = 'array' then p_request -> 'samples' else '[]'::jsonb end)) between 0 and 3
      and not exists (select 1 from jsonb_array_elements((case when jsonb_typeof(p_request -> 'samples') = 'array' then p_request -> 'samples' else '[]'::jsonb end)) AS s(value) where jsonb_typeof(s.value) <> 'array' or jsonb_array_length((case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end)) <> jsonb_array_length((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) or exists (select 1 from jsonb_array_elements((case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end)) AS c(value) where jsonb_typeof(c.value) <> 'string' or octet_length((c.value #>> '{}')) > 24 or (c.value #>> '{}') COLLATE "C" !~ '^[ -~]*$' or (c.value #>> '{}') COLLATE "C" ~ '[a-wyzA-WYZ0-8]'))
    else false
  end, false);
$$;

create or replace function public.trip_ai_proposal_is_valid(p_kind text, p_request jsonb, p_proposal jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(case p_kind
    when 'guided' then case
      when public.trip_ai_request_is_valid('guided', p_request)
        and (p_request ->> 'action') is not null
      then jsonb_typeof(p_proposal) = 'object'
        and p_proposal = jsonb_build_object((p_request ->> 'action'), p_request -> 'value')
      else false
    end
    when 'import_mapping' then case
      when public.trip_ai_request_is_valid('import_mapping', p_request)
      then jsonb_typeof(p_proposal) = 'object'
        and p_proposal ?& array['mapping']
        and p_proposal - 'mapping' = '{}'::jsonb
        and jsonb_typeof(p_proposal -> 'mapping') = 'object'
        and (select count(*) = jsonb_array_length((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) from jsonb_object_keys((case when jsonb_typeof(p_proposal -> 'mapping') = 'object' then p_proposal -> 'mapping' else '{}'::jsonb end)) AS k(key))
        and not exists (select 1 from jsonb_object_keys((case when jsonb_typeof(p_proposal -> 'mapping') = 'object' then p_proposal -> 'mapping' else '{}'::jsonb end)) AS k(key) where not exists (select 1 from jsonb_array_elements_text((case when jsonb_typeof(p_request -> 'headers') = 'array' then p_request -> 'headers' else '[]'::jsonb end)) AS h(value) where h.value = k.key))
        and not exists (select 1 from jsonb_each((case when jsonb_typeof(p_proposal -> 'mapping') = 'object' then p_proposal -> 'mapping' else '{}'::jsonb end)) AS m(key, value) where jsonb_typeof(m.value) not in ('string', 'null') or (jsonb_typeof(m.value) = 'string' and not (((p_request ->> 'entity') = 'people' and (m.value #>> '{}') in ('daybookId','codigoPersona','nombreCompleto','origen','destino','turno','fechaInicio','fechaTermino','equipaje','activa','version')) or ((p_request ->> 'entity') = 'trips' and (m.value #>> '{}') in ('daybookId','personaId','codigoPersona','persona','fechaPlanificada','fechaViaje','sentido','origen','destino','horaRequerida','equipaje','estado','pnr','vuelo','montoClp','observaciones','motivoCambio','version')))))
        and (select count(*) = count(distinct (m.value #>> '{}')) from jsonb_each((case when jsonb_typeof(p_proposal -> 'mapping') = 'object' then p_proposal -> 'mapping' else '{}'::jsonb end)) AS m(key, value) where jsonb_typeof(m.value) = 'string')
      else false
    end
    else false
  end, false);
$$;

revoke all on function public.trip_ai_request_is_valid(text, jsonb) from public;
revoke all on function public.trip_ai_proposal_is_valid(text, jsonb, jsonb) from public;

create table if not exists public.trip_ai_workers (
  user_id uuid primary key
);

create table if not exists public.trip_ai_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'guided' check (kind in ('guided', 'import_mapping')),
  trip_id uuid null references public.trips(id),
  actor uuid not null,
  request jsonb not null check (public.trip_ai_request_is_valid(kind, request)),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'failed', 'expired')),
  proposal jsonb null check (proposal is null or public.trip_ai_proposal_is_valid(kind, request, proposal)),
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
  v_now timestamptz;
begin
  if v_actor is null or not public.is_member() then
    raise exception 'no_autorizado';
  end if;
  if p_trip_id is null or not public.trip_ai_request_is_valid('guided', p_request) then
    raise exception 'solicitud_invalida';
  end if;
  if not exists (select 1 from public.trips where id = p_trip_id) then
    raise exception 'trip_no_encontrado';
  end if;
  -- Serializes this member's queue depth so concurrent browser clicks cannot
  -- both observe four pending requests and exceed the five-request ceiling.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  v_now := clock_timestamp();
  update public.trip_ai_requests
  set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
  where actor = v_actor and status in ('pending', 'claimed')
    and created_at < v_now - (case when kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end);
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
  v_now timestamptz;
begin
  if v_actor is null or not public.is_member() then raise exception 'no_autorizado'; end if;
  if not public.trip_ai_request_is_valid('import_mapping', p_request) then
    raise exception 'solicitud_invalida';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  v_now := clock_timestamp();
  update public.trip_ai_requests
  set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
  where actor = v_actor and status in ('pending', 'claimed')
    and created_at < v_now - (case when kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end);
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
  v_now timestamptz;
begin
  if v_actor is null then raise exception 'no_autorizado'; end if;
  select * into v_request from public.trip_ai_requests where id = p_id and actor = v_actor for update;
  if not found then raise exception 'no_autorizado'; end if;
  v_now := clock_timestamp();
  if v_request.status in ('pending', 'claimed') and v_request.created_at < v_now - (case when v_request.kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end) then
    update public.trip_ai_requests
    set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
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
  v_now timestamptz;
begin
  if v_actor is null or not exists (select 1 from public.trip_ai_workers where user_id = v_actor) then
    raise exception 'no_autorizado';
  end if;
  select * into v_request
  from public.trip_ai_requests
  where created_at >= clock_timestamp() - (case when kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end)
    and (status = 'pending' or (status = 'claimed' and claimed_at < clock_timestamp() - interval '30 seconds' and attempts < 3))
  order by created_at
  for update skip locked
  limit 1;
  if not found then return null; end if;
  v_now := clock_timestamp();
  if v_request.created_at < v_now - (case when v_request.kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end) then
    update public.trip_ai_requests
    set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
    where id = v_request.id;
    return null;
  end if;
  update public.trip_ai_requests
  set status = 'claimed', attempts = v_request.attempts + 1, claimed_by = v_actor, claimed_at = v_now
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
  v_now timestamptz;
begin
  if v_actor is null or not exists (select 1 from public.trip_ai_workers where user_id = v_actor) then
    raise exception 'no_autorizado';
  end if;
  select * into v_request from public.trip_ai_requests where id = p_id for update;
  if not found or v_request.status <> 'claimed' or v_request.claimed_by <> v_actor then
    raise exception 'request_not_claimed';
  end if;
  v_now := clock_timestamp();
  if v_request.created_at < v_now - (case when v_request.kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end) then
    update public.trip_ai_requests
    set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
    where id = v_request.id;
    return;
  end if;
  if not public.trip_ai_proposal_is_valid(v_request.kind, v_request.request, p_proposal) then
    raise exception 'model_response_invalid';
  end if;
  update public.trip_ai_requests
  set status = 'done', proposal = p_proposal, diagnostic = null, completed_at = v_now
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
  v_now timestamptz;
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
  v_now := clock_timestamp();
  if v_request.created_at < v_now - (case when v_request.kind = 'import_mapping' then interval '90 seconds' else interval '60 seconds' end) then
    update public.trip_ai_requests
    set status = 'expired', proposal = null, diagnostic = 'expired', completed_at = v_now
    where id = v_request.id;
    return;
  end if;
  update public.trip_ai_requests
  set status = 'failed', diagnostic = p_code, completed_at = v_now
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

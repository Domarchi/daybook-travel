-- Solo para el harness PostgreSQL desechable y sin red. Nunca una base existente.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select '11111111-1111-1111-1111-111111111111'::uuid
$$;
create function public.is_member() returns boolean language sql stable as $$ select false $$;
create table public.trips (id uuid primary key);
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Control positivo: REVOKE PUBLIC conserva el grant directo de anon.
create function public.acl_default_control() returns boolean language sql as $$ select true $$;
revoke all on function public.acl_default_control() from public;
DO $$ BEGIN
  IF NOT has_function_privilege('anon', 'public.acl_default_control()', 'EXECUTE') THEN
    RAISE EXCEPTION 'la fixture no reproduce el grant directo de anon';
  END IF;
END $$;
drop function public.acl_default_control();

-- MIGRATION_009

DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.request_trip_ai_proposal(uuid,jsonb)',
    'public.request_trip_import_mapping(jsonb)',
    'public.get_trip_ai_request(uuid)',
    'public.claim_trip_ai_request()',
    'public.complete_trip_ai_request(uuid,jsonb)',
    'public.fail_trip_ai_request(uuid,text)'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon conserva EXECUTE: %', signature;
    END IF;
    IF NOT has_function_privilege('authenticated', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated perdió EXECUTE: %', signature;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = signature::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC conserva EXECUTE: %', signature;
    END IF;
  END LOOP;
END $$;

set local role anon;
DO $$
DECLARE statement text;
BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'select public.request_trip_ai_proposal(null, ''{}''::jsonb)',
    'select public.request_trip_import_mapping(''{}''::jsonb)',
    'select public.get_trip_ai_request(null)',
    'select public.claim_trip_ai_request()',
    'select public.complete_trip_ai_request(null, ''{}''::jsonb)',
    'select public.fail_trip_ai_request(null, ''worker_error'')'
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'anon pudo invocar: %', statement;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
reset role;

-- Actor sintético autenticado, sin membresía ni allowlist worker.
set local role authenticated;
DO $$
DECLARE statement text;
BEGIN
  FOREACH statement IN ARRAY ARRAY[
    'select public.request_trip_ai_proposal(null, ''{}''::jsonb)',
    'select public.request_trip_import_mapping(''{}''::jsonb)',
    'select public.get_trip_ai_request(null)',
    'select public.claim_trip_ai_request()',
    'select public.complete_trip_ai_request(null, ''{}''::jsonb)',
    'select public.fail_trip_ai_request(null, ''worker_error'')'
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'la guarda permitió un actor no autorizado: %', statement;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'no_autorizado' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
reset role;
rollback;
\echo '6 queue RPC ACL and nonmember/worker guards passed'

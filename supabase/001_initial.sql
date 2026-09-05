begin;
create table public.members(email text primary key check(email=lower(email)), created_at timestamptz not null default now());
alter table public.members enable row level security;
create function public.is_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where email=lower(auth.jwt()->>'email')); $$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;
create table public.people (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 180),
 origin text not null check(length(trim(origin))>0), destination text not null default 'Copiapó',
 shift text not null check(shift in ('4×3','10×10')), start_date date not null,
 end_date date, baggage text not null default 'Por confirmar', active boolean not null default true,
 created_at timestamptz not null default now(), check(end_date is null or end_date>=start_date)
);
create table public.trips (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id),
 date date not null, direction text not null check(direction in ('SUBIDA','BAJADA')),
 origin text not null, destination text not null, requested_time time, baggage text not null default 'Por confirmar',
 status text not null default 'Planificado' check(status in ('Planificado','Solicitado','Emitido','Volado','Anulado','No presentado')),
 pnr text not null default '', flight text not null default '', amount numeric(12,2) check(amount>=0),
 notes text not null default '', updated_at timestamptz not null default now(),
 unique(person_id,date,direction), check(status not in ('Emitido','Volado','No presentado') or length(trim(pnr))>0)
);
create table public.history(id bigint generated always as identity primary key, entity text not null, record_id uuid not null, actor uuid, action text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());
alter table public.people enable row level security;
alter table public.trips enable row level security;
alter table public.history enable row level security;
create policy people_read on public.people for select to authenticated using(public.is_member());
create policy people_insert on public.people for insert to authenticated with check(public.is_member());
create policy people_update on public.people for update to authenticated using(public.is_member()) with check(public.is_member());
create policy trips_read on public.trips for select to authenticated using(public.is_member());
create policy trips_insert on public.trips for insert to authenticated with check(public.is_member());
create policy trips_update on public.trips for update to authenticated using(public.is_member()) with check(public.is_member());
create policy history_read on public.history for select to authenticated using(public.is_member());
revoke all on public.members,public.people,public.trips,public.history from anon,authenticated;
grant select,insert,update on public.people,public.trips to authenticated;
grant select on public.history to authenticated;
create function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.history(entity,record_id,actor,action,before_data,after_data) values(TG_TABLE_NAME,new.id,auth.uid(),TG_OP,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new)); return new; end; $$;
create trigger people_audit after insert or update on public.people for each row execute function public.audit_change();
create trigger trips_audit after insert or update on public.trips for each row execute function public.audit_change();
create function public.generate_pulse(p_id uuid, p_until date) returns integer language plpgsql security invoker set search_path='' as $$
declare p public.people; n integer; begin
 if not public.is_member() then raise exception 'Acceso no autorizado'; end if;
 select * into p from public.people where id=p_id;
 if p.id is null or not p.active or p.shift<>'4×3' then raise exception 'Selecciona una persona activa en 4×3'; end if;
 if extract(isodow from p.start_date)<>1 then raise exception 'La primera subida debe ser lunes'; end if;
 if p_until<p.start_date or p_until>p.start_date+interval '2 years' then raise exception 'El período debe ser de hasta dos años'; end if;
 insert into public.trips(person_id,date,direction,origin,destination,baggage)
 select p.id,d::date,s.direction,case when s.direction='SUBIDA' then p.origin else p.destination end,case when s.direction='SUBIDA' then p.destination else p.origin end,p.baggage
 from generate_series(p.start_date::timestamp,least(p_until,coalesce(p.end_date,p_until))::timestamp,interval '1 day') d
 cross join lateral(select case when extract(isodow from d)=1 then 'SUBIDA' else 'BAJADA' end direction) s
 where extract(isodow from d) in (1,4) on conflict(person_id,date,direction) do nothing;
 get diagnostics n=row_count;return n;end; $$;
revoke all on function public.generate_pulse(uuid,date) from public;
grant execute on function public.generate_pulse(uuid,date) to authenticated;
create index trips_date_idx on public.trips(date);
create index history_record_idx on public.history(record_id,created_at);
commit;

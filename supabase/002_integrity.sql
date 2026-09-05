begin;
alter table public.trips add column planned_date date;
create unique index trips_planned_unique on public.trips(person_id,planned_date,direction) where planned_date is not null;
create function public.validate_trip() returns trigger language plpgsql set search_path='' as $$
declare p public.people; begin
 if TG_OP='UPDATE' then
  new.updated_at=clock_timestamp();
  if length(trim(new.notes))=0 then raise exception 'Escribe el motivo del cambio'; end if;
  if new.planned_date is distinct from old.planned_date or new.person_id<>old.person_id or new.direction<>old.direction then raise exception 'Conserva la persona y sentido del viaje; anula y crea otro si corresponde'; end if;
 end if;
 if TG_OP='INSERT' or new.date<>old.date then
  select * into p from public.people where id=new.person_id;
  if not p.active or new.date<p.start_date or (p.end_date is not null and new.date>p.end_date) then raise exception 'El viaje debe estar dentro de la vigencia de una persona activa'; end if;
 end if;
 if length(trim(new.origin))=0 or length(trim(new.destination))=0 then raise exception 'Completa origen y destino';end if;
 return new;end; $$;
create trigger trips_validate before insert or update on public.trips for each row execute function public.validate_trip();
create or replace function public.generate_pulse(p_id uuid,p_until date) returns integer language plpgsql security invoker set search_path='' as $$
declare p public.people;n integer;begin
 if not public.is_member() then raise exception 'Acceso no autorizado';end if;
 select * into p from public.people where id=p_id for update;
 if p.id is null or not p.active or p.shift<>'4×3' then raise exception 'Selecciona una persona activa en 4×3';end if;
 if extract(isodow from p.start_date)<>1 then raise exception 'La primera subida debe ser lunes';end if;
 if p_until<p.start_date or p_until>p.start_date+interval '2 years' then raise exception 'El período debe ser de hasta dos años';end if;
 insert into public.trips(person_id,date,planned_date,direction,origin,destination,baggage)
 select p.id,d::date,d::date,s.direction,case when s.direction='SUBIDA' then p.origin else p.destination end,case when s.direction='SUBIDA' then p.destination else p.origin end,p.baggage
 from generate_series(p.start_date::timestamp,least(p_until,coalesce(p.end_date,p_until))::timestamp,interval '1 day') d
 cross join lateral(select case when extract(isodow from d)=1 then 'SUBIDA' else 'BAJADA' end direction) s
 where extract(isodow from d) in(1,4) on conflict do nothing;
 get diagnostics n=row_count;return n;end; $$;
commit;

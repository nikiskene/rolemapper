create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100)
);
create index companies_owner_idx on public.companies(owner_id);
create table public.maps (
  company_id uuid primary key references public.companies(id) on delete cascade
);
create table public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.maps(company_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  bio text not null default '' check (length(bio) <= 3000),
  linkedin text not null default '' check (length(linkedin) <= 500 and (linkedin = '' or linkedin ~* '^https://([a-z0-9-]+\.)?linkedin\.com/[^[:space:]]+$')),
  email text not null default '' check (length(email) <= 254 and (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  affiliation text not null default '' check (length(affiliation) <= 120),
  unique (company_id, id)
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.maps(company_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  unique (company_id, id)
);
create table public.placements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.maps(company_id) on delete cascade,
  zone text not null check (zone in ('founder','investors','advisor-left','advisor-right','cofounder-left','cofounder-right','partner-left','partner-right','team')),
  rank integer not null check (rank >= 0),
  title text not null check (length(btrim(title)) between 1 and 120),
  remit text not null default '' check (length(remit) <= 2000),
  status text not null check (status in ('Filled','Open','Later')),
  person_id uuid,
  organization_id uuid,
  foreign key (company_id, person_id) references public.people(company_id, id),
  foreign key (company_id, organization_id) references public.organizations(company_id, id),
  check ((status = 'Filled') = (person_id is not null or organization_id is not null))
);
create index placements_order_idx on public.placements(company_id, zone, rank, id);
create index placements_person_idx on public.placements(company_id, person_id);
create index placements_org_idx on public.placements(company_id, organization_id);

alter table public.companies enable row level security;
create policy own_company on public.companies for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['maps','people','organizations','placements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_company_rows on public.%I for all to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())))', t);
  end loop;
end $$;

revoke all on public.companies, public.maps, public.people, public.organizations, public.placements from public, anon, authenticated;
grant select on public.companies, public.maps, public.people, public.organizations, public.placements to authenticated;
grant insert, delete on public.people, public.organizations, public.placements to authenticated;
grant update (name,bio,linkedin,email,affiliation) on public.people to authenticated;
grant update (name) on public.organizations to authenticated;
grant update (zone,rank,title,remit,status,person_id,organization_id) on public.placements to authenticated;

-- The caller cannot supply an owner ID, and the workspace and map are created together.
create function public.create_company(company_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare workspace uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.companies (owner_id, name)
    values (auth.uid(), btrim(company_name)) returning id into workspace;
  insert into public.maps (company_id) values (workspace);
  return workspace;
end $$;

-- Save the contact, organization and placement in one transaction under the caller's RLS.
create function public.save_card(workspace uuid, card uuid, fields jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  person uuid := nullif(fields->>'person_id','')::uuid;
  organization uuid := nullif(fields->>'organization_id','')::uuid;
  target text := fields->>'zone';
  next_rank integer;
begin
  if not exists (select 1 from public.companies where id = workspace) then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(workspace::text, 0));
  if nullif(btrim(fields->>'person_name'),'') is not null then
    if person is null then
      insert into public.people(company_id,name,bio,linkedin,email,affiliation)
      values(workspace,btrim(fields->>'person_name'),fields->>'bio',fields->>'linkedin',fields->>'email',fields->>'affiliation')
      returning id into person;
    else
      update public.people set name=btrim(fields->>'person_name'),bio=fields->>'bio',linkedin=fields->>'linkedin',
        email=fields->>'email',affiliation=fields->>'affiliation' where company_id=workspace and id=person;
      if not found then raise insufficient_privilege; end if;
    end if;
  end if;
  if nullif(btrim(fields->>'organization_name'),'') is not null then
    if organization is null then
      insert into public.organizations(company_id,name) values(workspace,btrim(fields->>'organization_name')) returning id into organization;
    else
      update public.organizations set name=btrim(fields->>'organization_name') where company_id=workspace and id=organization;
      if not found then raise insufficient_privilege; end if;
    end if;
  end if;
  select coalesce(max(rank)+1,0) into next_rank from public.placements where company_id=workspace and zone=target;
  if card is null then
    insert into public.placements(company_id,zone,rank,title,remit,status,person_id,organization_id)
    values(workspace,target,next_rank,btrim(fields->>'title'),fields->>'remit',fields->>'status',person,organization) returning id into card;
  else
    update public.placements set rank=case when zone=target then rank else next_rank end, zone=target,
      title=btrim(fields->>'title'),remit=fields->>'remit',status=fields->>'status',person_id=person,organization_id=organization
      where company_id=workspace and id=card;
    if not found then raise insufficient_privilege; end if;
  end if;
  return card;
end $$;

create function public.move_card(workspace uuid, card uuid, target text, before_card uuid default null) returns void
language plpgsql security invoker set search_path = '' as $$
declare ordered uuid[]; item uuid; position integer := 0; found_anchor boolean := false;
begin
  if not exists (select 1 from public.companies where id=workspace) then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(workspace::text, 0));
  if not exists (select 1 from public.placements where company_id=workspace and id=card) then raise insufficient_privilege; end if;
  if before_card = card then return; end if;
  select coalesce(array_agg(id order by rank,id),array[]::uuid[]) into ordered from public.placements
    where company_id=workspace and zone=target and id<>card;
  foreach item in array ordered loop
    if item = before_card then
      update public.placements set zone=target,rank=position where company_id=workspace and id=card;
      position := position + 1;
      found_anchor := true;
    end if;
    update public.placements set rank=position where company_id=workspace and id=item;
    position := position + 1;
  end loop;
  if before_card is null then
    update public.placements set zone=target,rank=position where company_id=workspace and id=card;
  elsif not found_anchor then raise exception 'The destination changed. Refresh and try again.';
  end if;
end $$;

revoke all on function public.create_company(text), public.save_card(uuid,uuid,jsonb), public.move_card(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.create_company(text), public.save_card(uuid,uuid,jsonb), public.move_card(uuid,uuid,text,uuid) to authenticated;

create schema rolemapper_sharing;
revoke all on schema rolemapper_sharing from public, anon, authenticated;

create table public.person_headshots (
  company_id uuid not null,
  person_id uuid not null,
  image text check (length(image) <= 24000 and image ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'),
  primary key (company_id,person_id),
  foreign key (company_id,person_id) references public.people(company_id,id) on delete cascade
);
alter table public.person_headshots enable row level security;
create policy headshots_owner on public.person_headshots for all to authenticated
using (public.has_workspace_access(company_id)) with check (public.has_workspace_access(company_id));
revoke all on public.person_headshots from public, anon, authenticated;
grant select, insert, update, delete on public.person_headshots to authenticated;

create table rolemapper_sharing.snapshots (
  token uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.companies(id) on delete cascade,
  title text not null,
  cards jsonb not null,
  photos jsonb not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table rolemapper_sharing.snapshots enable row level security;

create function public.publish_map_snapshot(workspace uuid, visible_cards uuid[], include_headshots boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare share_token uuid := gen_random_uuid();
declare company_name text;
declare entries jsonb;
declare headshots jsonb := '{}'::jsonb;
begin
  if not public.has_workspace_access(workspace) then raise insufficient_privilege; end if;
  if coalesce(cardinality(visible_cards),0) not between 1 and 10000 then
    raise exception 'Choose between 1 and 10,000 placements to share.';
  end if;
  select name into strict company_name from public.companies where id=workspace;
  select jsonb_agg(jsonb_build_object(
    'id', placement.id, 'zone', placement.zone, 'title', placement.title,
    'name', coalesce(person.name, organization.name, placement.title),
    'status', placement.status, 'photoId', case when include_headshots then photo.person_id end
  ) order by placement.zone, placement.rank, placement.id)
  into entries from public.placements placement
  left join public.people person on person.company_id=workspace and person.id=placement.person_id
  left join public.organizations organization on organization.company_id=workspace and organization.id=placement.organization_id
  left join public.person_headshots photo on include_headshots and photo.image is not null and photo.company_id=workspace and photo.person_id=placement.person_id
  where placement.company_id=workspace and placement.id=any(visible_cards);
  if entries is null then raise exception 'There are no visible placements to share.'; end if;
  if include_headshots then
    select coalesce(jsonb_object_agg(person_id,image),'{}'::jsonb) into headshots from public.person_headshots
    where image is not null and company_id=workspace and person_id in (
      select person_id from public.placements where company_id=workspace and id=any(visible_cards)
    );
  end if;
  insert into rolemapper_sharing.snapshots(token,workspace_id,title,cards,photos)
    values(share_token,workspace,company_name,entries,headshots)
    on conflict(workspace_id) do update set token=excluded.token,title=excluded.title,
      cards=excluded.cards,photos=excluded.photos,created_at=now(),revoked_at=null;
  return share_token;
end;
$$;

create function public.my_map_snapshot(workspace uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_workspace_access(workspace) then raise insufficient_privilege; end if;
  return (select token from rolemapper_sharing.snapshots where workspace_id=workspace and revoked_at is null);
end;
$$;

create function public.revoke_map_snapshot(workspace uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_workspace_access(workspace) then raise insufficient_privilege; end if;
  update rolemapper_sharing.snapshots set revoked_at=now(),title='',cards='[]'::jsonb,photos='{}'::jsonb
    where workspace_id=workspace and revoked_at is null;
end;
$$;

create function public.read_map_snapshot(share_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title',title,'cards',cards)
  from rolemapper_sharing.snapshots
  where token=share_token and revoked_at is null
    and not exists (select from rolemapper_admin.workspace_holds where workspace_id=snapshots.workspace_id)
    and not exists (select from rolemapper_admin.account_holds hold
      join public.companies company on company.owner_id=hold.user_id where company.id=snapshots.workspace_id);
$$;

create function public.read_map_snapshot_photos(share_token uuid, photo_ids uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(item.key,item.value),'{}'::jsonb)
  from rolemapper_sharing.snapshots snapshot
  cross join lateral jsonb_each(snapshot.photos) item
  where snapshot.token=share_token and snapshot.revoked_at is null and cardinality(photo_ids)<=60
    and item.key::uuid=any(photo_ids)
    and not exists (select from rolemapper_admin.workspace_holds where workspace_id=snapshot.workspace_id)
    and not exists (select from rolemapper_admin.account_holds hold
      join public.companies company on company.owner_id=hold.user_id where company.id=snapshot.workspace_id);
$$;

revoke all on function public.publish_map_snapshot(uuid,uuid[],boolean),public.my_map_snapshot(uuid),
  public.revoke_map_snapshot(uuid),public.read_map_snapshot(uuid),public.read_map_snapshot_photos(uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.publish_map_snapshot(uuid,uuid[],boolean),public.my_map_snapshot(uuid),
  public.revoke_map_snapshot(uuid) to authenticated;
grant execute on function public.read_map_snapshot(uuid),public.read_map_snapshot_photos(uuid,uuid[]) to anon,authenticated;

create function public.save_card_with_headshot(workspace uuid, card uuid, fields jsonb, photo text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved uuid;
declare person uuid;
begin
  saved := public.save_card(workspace,card,fields);
  select person_id into person from public.placements where company_id=workspace and id=saved;
  if photo is null then return saved; end if;
  if person is null then raise exception 'A headshot needs a named person.'; end if;
  if photo = '' then
    update public.person_headshots set image=null where company_id=workspace and person_id=person;
  else
    insert into public.person_headshots(company_id,person_id,image) values(workspace,person,photo)
      on conflict(company_id,person_id) do update set image=excluded.image;
  end if;
  return saved;
end;
$$;
revoke all on function public.save_card_with_headshot(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_card_with_headshot(uuid,uuid,jsonb,text) to authenticated;

create schema rolemapper_admin;
revoke all on schema rolemapper_admin from public, anon, authenticated;

create table rolemapper_admin.members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table rolemapper_admin.account_holds (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table rolemapper_admin.workspace_holds (
  workspace_id uuid primary key references public.companies(id) on delete cascade
);
create table rolemapper_admin.audit_log (
  id bigint generated always as identity primary key,
  actor uuid not null,
  target uuid not null,
  target_kind text not null check (target_kind in ('account', 'workspace')),
  suspended boolean not null,
  occurred_at timestamptz not null default now()
);

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from rolemapper_admin.members where user_id = auth.uid());
$$;

create function public.has_workspace_access(workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.companies
    where id = workspace and owner_id = auth.uid()
      and not exists (select from rolemapper_admin.account_holds where user_id = auth.uid())
      and not exists (select from rolemapper_admin.workspace_holds where workspace_id = workspace)
  );
$$;

alter policy own_company on public.companies
  using (public.has_workspace_access(id))
  with check (public.has_workspace_access(id));

-- The existing map policies all look up their company through its owner policy.
create function rolemapper_admin.check_company_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select from rolemapper_admin.account_holds where user_id = new.owner_id) then
    raise exception 'Workspace access is suspended for this account' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_company_creation before insert on public.companies
for each row execute function rolemapper_admin.check_company_creation();

create function public.admin_directory(page_number integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  directory jsonb;
begin
  if not public.is_platform_admin() then raise insufficient_privilege; end if;
  if page_number is null or page_number < 1 then raise invalid_parameter_value; end if;
  select jsonb_build_object(
    'total_accounts', (select count(*) from auth.users),
    'accounts', coalesce(jsonb_agg(to_jsonb(account) order by account.created_at desc, account.id), '[]'::jsonb)
  ) into directory
  from (
    select users.id, users.email, users.created_at,
      users.email_confirmed_at is not null as confirmed,
      exists (select from rolemapper_admin.members where user_id = users.id) as administrator,
      exists (select from rolemapper_admin.account_holds where user_id = users.id) as suspended
    from auth.users users
    order by users.created_at desc, users.id
    limit 50 offset (page_number::bigint - 1) * 50
  ) account;
  return directory;
end;
$$;

create function public.admin_workspaces(account_id uuid, page_number integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  directory jsonb;
begin
  if not public.is_platform_admin() then raise insufficient_privilege; end if;
  if page_number is null or page_number < 1 then raise invalid_parameter_value; end if;
  select jsonb_build_object(
    'total_workspaces', (select count(*) from public.companies where owner_id = account_id),
    'workspaces', coalesce(jsonb_agg(to_jsonb(workspace) order by workspace.id), '[]'::jsonb)
  ) into directory
  from (
    select company.id,
      exists (select from rolemapper_admin.workspace_holds where workspace_id = company.id) as suspended
    from public.companies company where company.owner_id = account_id
    order by company.id
    limit 50 offset (page_number::bigint - 1) * 50
  ) workspace;
  return directory;
end;
$$;

create function public.admin_set_access(target_id uuid, resource text, suspend boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_owner uuid;
  affected integer;
begin
  if not public.is_platform_admin() then raise insufficient_privilege; end if;
  if suspend is null then raise invalid_parameter_value; end if;
  if resource = 'account' then
    select id into strict target_owner from auth.users where id = target_id for update;
  elsif resource = 'workspace' then
    select owner_id into strict target_owner from public.companies where id = target_id for update;
  else
    raise invalid_parameter_value;
  end if;
  if suspend and exists (select from rolemapper_admin.members where user_id = target_owner) then
    raise exception 'Administrator access cannot be suspended in this console' using errcode = '42501';
  end if;

  if resource = 'account' and suspend then
    insert into rolemapper_admin.account_holds values (target_id) on conflict do nothing;
  elsif resource = 'account' then
    delete from rolemapper_admin.account_holds where user_id = target_id;
  elsif suspend then
    insert into rolemapper_admin.workspace_holds values (target_id) on conflict do nothing;
  else
    delete from rolemapper_admin.workspace_holds where workspace_id = target_id;
  end if;
  get diagnostics affected = row_count;
  if affected > 0 then
    insert into rolemapper_admin.audit_log (actor, target, target_kind, suspended)
    values (auth.uid(), target_id, resource, suspend);
  end if;
end;
$$;

revoke all on function public.is_platform_admin(), public.has_workspace_access(uuid),
  public.admin_directory(integer), public.admin_workspaces(uuid, integer),
  public.admin_set_access(uuid, text, boolean), rolemapper_admin.check_company_creation()
  from public, anon, authenticated;
grant execute on function public.is_platform_admin(), public.has_workspace_access(uuid),
  public.admin_directory(integer), public.admin_workspaces(uuid, integer),
  public.admin_set_access(uuid, text, boolean) to authenticated;

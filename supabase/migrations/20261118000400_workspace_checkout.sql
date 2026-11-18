alter table rolemapper_billing.accounts
  add column checkout_attempt uuid,
  add column checkout_expires_at timestamptz;

create table rolemapper_billing.map_guards (
  workspace_id uuid primary key references public.companies(id) on delete cascade,
  revision bigint not null default 0
);
alter table rolemapper_billing.map_guards enable row level security;

create function public.billing_summary(workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_workspace_access(workspace) then raise insufficient_privilege; end if;
  select jsonb_build_object(
    'paid', account.subscription_status = 'active' and coalesce(account.eligible_until > now(),false),
    'status', account.subscription_status, 'eligible_until', account.eligible_until,
    'cancel_at_period_end', account.cancel_at_period_end, 'has_customer', true
  ) into result from rolemapper_billing.accounts account where workspace_id = workspace;
  return coalesce(result, '{"paid":false,"status":"none","has_customer":false}'::jsonb);
end;
$$;

create function public.stripe_workspace_account(workspace uuid, account_owner uuid, customer text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare linked text;
begin
  if not exists (select from public.companies where id=workspace and owner_id=account_owner)
    or exists (select from rolemapper_admin.account_holds where user_id=account_owner)
    or exists (select from rolemapper_admin.workspace_holds where workspace_id=workspace) then
    raise insufficient_privilege;
  end if;
  if customer is not null then
    insert into rolemapper_billing.accounts(workspace_id,stripe_customer_id) values(workspace,customer)
      on conflict(workspace_id) do nothing;
  end if;
  select stripe_customer_id into linked from rolemapper_billing.accounts where workspace_id=workspace;
  return linked;
end;
$$;

create function public.reserve_stripe_checkout(workspace uuid, account_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare linked text;
declare reservation rolemapper_billing.accounts%rowtype;
begin
  linked := public.stripe_workspace_account(workspace,account_owner);
  if linked is null then raise invalid_parameter_value; end if;
  select * into strict reservation from rolemapper_billing.accounts where workspace_id=workspace for update;
  if reservation.checkout_attempt is null or reservation.checkout_expires_at + interval '1 minute' <= now() then
    update rolemapper_billing.accounts set checkout_attempt=gen_random_uuid(),
      checkout_expires_at=date_trunc('second',now() + interval '1 hour')
      where workspace_id=workspace returning * into reservation;
  end if;
  return jsonb_build_object('attempt',reservation.checkout_attempt,'expires',extract(epoch from reservation.checkout_expires_at)::bigint);
end;
$$;

create function rolemapper_billing.enforce_map_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous_person uuid;
declare previous_id uuid;
begin
  if new.person_id is null then return new; end if;
  if auth.uid() is not null and not public.has_workspace_access(new.company_id) then return new; end if;
  if not exists (select from public.maps where company_id=new.company_id) then return new; end if;
  if tg_op='UPDATE' then
    if new.person_id is not distinct from old.person_id then return new; end if;
    previous_person := old.person_id;
    previous_id := old.id;
  end if;
  -- Updating this row serializes concurrent additions and prevents a stale snapshot
  -- in repeatable-read transactions from bypassing the limit.
  insert into rolemapper_billing.map_guards(workspace_id) values(new.company_id)
    on conflict(workspace_id) do update set revision = rolemapper_billing.map_guards.revision + 1;
  if exists (select from rolemapper_billing.accounts where workspace_id=new.company_id
      and subscription_status='active' and eligible_until>now()) then return new; end if;
  if exists (select from public.placements where company_id=new.company_id and person_id=new.person_id) then
    return new;
  end if;
  if previous_person is not null and not exists (select from public.placements
      where company_id=new.company_id and person_id=previous_person and id<>previous_id) then
    return new;
  end if;
  if (select count(distinct person_id) from public.placements where company_id=new.company_id) >= 5 then
    raise exception 'The free plan includes five people. Upgrade this company to add another person.' using errcode='RM005';
  end if;
  return new;
end;
$$;

-- Check each row so bulk inserts cannot skip the cap.
create trigger enforce_workspace_map_limit before insert or update of person_id
on public.placements for each row execute function rolemapper_billing.enforce_map_limit();

revoke all on function public.billing_summary(uuid), public.stripe_workspace_account(uuid,uuid,text),
  public.reserve_stripe_checkout(uuid,uuid), rolemapper_billing.enforce_map_limit() from public, anon, authenticated;
grant execute on function public.billing_summary(uuid) to authenticated;
grant execute on function public.stripe_workspace_account(uuid,uuid,text),
  public.reserve_stripe_checkout(uuid,uuid) to service_role;

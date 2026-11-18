create schema rolemapper_billing;
revoke all on schema rolemapper_billing from public, anon, authenticated;

create table rolemapper_billing.accounts (
  workspace_id uuid primary key references public.companies(id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  subscription_status text not null default 'none' check (
    subscription_status in ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
  ),
  eligible_until timestamptz,
  cancel_at_period_end boolean not null default false,
  issued_revision bigint not null default 0,
  applied_revision bigint not null default 0
);

create table rolemapper_billing.events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  workspace_id uuid not null references rolemapper_billing.accounts(workspace_id) on delete cascade,
  processed_at timestamptz not null default now()
);

alter table rolemapper_billing.accounts enable row level security;
alter table rolemapper_billing.events enable row level security;

create function public.begin_stripe_sync(customer_id text, event_reference text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare revision bigint;
begin
  update rolemapper_billing.accounts
    set issued_revision = issued_revision + 1
    where stripe_customer_id = customer_id
      and not exists (select from rolemapper_billing.events where event_id = event_reference)
    returning issued_revision into revision;
  return revision;
end;
$$;

create function public.finish_stripe_sync(
  customer_id text, event_reference text, sync_revision bigint, subscription_id text,
  current_status text, current_eligible_until timestamptz, current_cancel_at_period_end boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare workspace uuid;
declare issued bigint;
begin
  select workspace_id, issued_revision into workspace, issued
    from rolemapper_billing.accounts where stripe_customer_id = customer_id for update;
  if not found then return; end if;
  if sync_revision is null or sync_revision < 1 or sync_revision > issued then
    raise invalid_parameter_value;
  end if;
  insert into rolemapper_billing.events (event_id, workspace_id) values (event_reference, workspace)
    on conflict do nothing;
  update rolemapper_billing.accounts set
    stripe_subscription_id = subscription_id,
    subscription_status = current_status,
    eligible_until = current_eligible_until,
    cancel_at_period_end = current_cancel_at_period_end,
    applied_revision = sync_revision
  where workspace_id = workspace and applied_revision < sync_revision;
end;
$$;

revoke all on function public.begin_stripe_sync(text,text),
  public.finish_stripe_sync(text,text,bigint,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.begin_stripe_sync(text,text),
  public.finish_stripe_sync(text,text,bigint,text,text,timestamptz,boolean) to service_role;

create schema rolemapper_feedback;
revoke all on schema rolemapper_feedback from public, anon, authenticated;

create table rolemapper_feedback.requests (
  id uuid primary key default gen_random_uuid(),
  headline text not null check (length(headline)<=100),
  description text not null check (length(description)<=1000),
  benefit text not null check (length(benefit)<=700),
  status text not null default 'unread'
    check (status in ('unread','working','ignored','resolved','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table rolemapper_feedback.requests enable row level security;
create index feature_requests_inbox on rolemapper_feedback.requests(status,created_at desc,id);

create function public.submit_feature_request(headline text, description text, benefit text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(coalesce(headline,''))) not between 1 and 100
    or length(trim(coalesce(description,''))) not between 1 and 1000
    or length(trim(coalesce(benefit,''))) not between 1 and 700 then
    raise invalid_parameter_value;
  end if;
  insert into rolemapper_feedback.requests(headline,description,benefit)
    values(btrim(headline),btrim(description),btrim(benefit));
end;
$$;

create function public.admin_feature_requests(inbox_status text default 'all', page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare entries jsonb;
declare matching bigint;
declare unread bigint;
begin
  if not public.is_platform_admin() then raise insufficient_privilege; end if;
  if inbox_status is null or inbox_status not in ('all','unread','working','ignored','resolved')
    or page_number is null or page_number<1 then raise invalid_parameter_value; end if;
  select count(*) into unread from rolemapper_feedback.requests where status='unread';
  select count(*) into matching from rolemapper_feedback.requests
    where status<>'deleted' and (inbox_status='all' or status=inbox_status);
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.created_at desc, entry.id),'[]'::jsonb)
    into entries from (
    select id,headline,description,benefit,status,created_at from rolemapper_feedback.requests
      where status<>'deleted' and (inbox_status='all' or status=inbox_status)
      order by created_at desc,id limit 25 offset (page_number::bigint-1)*25
    ) entry;
  return jsonb_build_object('requests',entries,'total',matching,'unread',unread);
end;
$$;

create function public.admin_set_feature_request(request_id uuid, next_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise insufficient_privilege; end if;
  if next_status is null or next_status not in ('unread','working','ignored','resolved','deleted') then
    raise invalid_parameter_value;
  end if;
  update rolemapper_feedback.requests set status=next_status,updated_at=now(),
    headline=case when next_status='deleted' then '' else headline end,
    description=case when next_status='deleted' then '' else description end,
    benefit=case when next_status='deleted' then '' else benefit end
  where id=request_id and status<>'deleted';
end;
$$;

revoke all on function public.submit_feature_request(text,text,text),
  public.admin_feature_requests(text,integer),public.admin_set_feature_request(uuid,text)
  from public,anon,authenticated;
grant execute on function public.submit_feature_request(text,text,text) to service_role;
grant execute on function public.admin_feature_requests(text,integer),
  public.admin_set_feature_request(uuid,text) to authenticated;

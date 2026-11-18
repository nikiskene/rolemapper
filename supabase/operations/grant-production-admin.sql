-- Run in the Rolemapper production project after applying the platform admin migration.
do $$
declare admin_id constant uuid := '77c37662-3ccb-4e45-89bd-e291a0766690';
begin
  if not exists (
    select from auth.users where id = admin_id and lower(email) = 'ns@iacy.com'
      and email_confirmed_at is not null
  ) then
    raise exception 'The expected confirmed Rolemapper account was not found';
  end if;
  insert into rolemapper_admin.members (user_id) values (admin_id) on conflict do nothing;
end;
$$;

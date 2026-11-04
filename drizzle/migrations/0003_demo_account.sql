-- ============ DEMO ACCOUNT ============
-- A shared demo login (demo@biory.app) used by the "Try the demo" button on the sign-in page.
-- The account is created by the client on first use (normal sign-up); these triggers auto-confirm
-- its email and grant it every role so the whole application and all menus can be explored.
-- To switch the demo off: delete the user from auth.users (and/or drop these triggers).

create or replace function public.is_demo_email(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select lower(coalesce(p_email, '')) = 'demo@biory.app'
$$;

-- Confirm the demo email immediately so password sign-in works even when email confirmation is required.
create or replace function public.confirm_demo_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_demo_email(new.email) and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists on_auth_demo_user_confirm on auth.users;
create trigger on_auth_demo_user_confirm before insert or update on auth.users
  for each row execute function public.confirm_demo_user();

-- Grant every role to the demo account. Triggers fire in name order, so "on_auth_user_created_zz_demo"
-- runs after "on_auth_user_created" (handle_new_user) has created the profile.
create or replace function public.grant_demo_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_demo_email(new.email) then
    update public.profiles set full_name = 'Demo User' where id = new.id and (full_name is null or full_name = '' or full_name = 'demo');
    insert into public.user_roles (user_id, role)
      select new.id, r from unnest(enum_range(null::public.app_role)) as r
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created_zz_demo on auth.users;
create trigger on_auth_user_created_zz_demo after insert on auth.users
  for each row execute function public.grant_demo_roles();

-- If the demo account already exists, confirm it and grant the roles now.
update auth.users set email_confirmed_at = now() where public.is_demo_email(email) and email_confirmed_at is null;
insert into public.user_roles (user_id, role)
  select u.id, r from auth.users u cross join unnest(enum_range(null::public.app_role)) as r
  where public.is_demo_email(u.email)
on conflict do nothing;

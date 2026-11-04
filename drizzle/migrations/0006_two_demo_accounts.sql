-- ============ TWO DEMO ACCOUNTS ============
-- demo@biory.app     → Super Admin only (manages everything; sees every admin menu)
-- so.demo@biory.app  → Sales Officer only (field view: orders, requisitions, visits, wallet)
-- Both are created by the sign-in page on first use; these triggers auto-confirm them and
-- assign their roles. Delete the users from auth.users to switch the demo off.

create or replace function public.is_demo_email(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select lower(coalesce(p_email, '')) in ('demo@biory.app', 'so.demo@biory.app')
$$;

create or replace function public._setup_demo_user(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_so boolean := lower(p_email) = 'so.demo@biory.app';
begin
  if v_so then
    update profiles set full_name = 'Demo Sales Officer', territory_id = (select id from territories where name = 'Dohar')
      where id = p_user;
    delete from user_roles where user_id = p_user and role <> 'sales_officer';
    insert into user_roles (user_id, role) values (p_user, 'sales_officer') on conflict do nothing;
    -- Give the demo SO the workbook's BRY001 chemists and doctors so orders and visits can be tried.
    update chemists set assigned_so = p_user where code like 'B001C%' and assigned_so is null;
    update doctors set assigned_so = p_user where code like 'B001D%' and assigned_so is null;
  else
    update profiles set full_name = 'Demo Super Admin' where id = p_user;
    delete from user_roles where user_id = p_user and role <> 'super_admin';
    insert into user_roles (user_id, role) values (p_user, 'super_admin') on conflict do nothing;
  end if;
end $$;
revoke execute on function public._setup_demo_user(uuid, text) from public, anon, authenticated;

create or replace function public.grant_demo_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_demo_email(new.email) then perform public._setup_demo_user(new.id, new.email); end if;
  return new;
end $$;

-- Apply to demo accounts that already exist.
update auth.users set email_confirmed_at = now() where public.is_demo_email(email) and email_confirmed_at is null;
do $$ declare u record;
begin
  for u in select id, email from auth.users where public.is_demo_email(email) loop
    perform public._setup_demo_user(u.id, u.email);
  end loop;
end $$;

-- Which menus each role may open, plus one role and a visible password per user.
-- Safe to run again.

create table if not exists public.role_menus (
  role public.app_role not null,
  menu_key text not null,
  primary key (role, menu_key)
);
alter table public.role_menus enable row level security;

insert into public.role_menus (role, menu_key)
select r.role::public.app_role, r.menu_key
from (values
  ('super_admin', '/dashboard'),
  ('admin', '/dashboard'),
  ('finance_admin', '/dashboard'),
  ('warehouse_admin', '/dashboard'),
  ('sales_officer', '/dashboard'),
  ('super_admin', '/orders'),
  ('admin', '/orders'),
  ('finance_admin', '/orders'),
  ('warehouse_admin', '/orders'),
  ('sales_officer', '/orders'),
  ('super_admin', '/visits'),
  ('admin', '/visits'),
  ('sales_officer', '/visits'),
  ('super_admin', '/inventory'),
  ('admin', '/inventory'),
  ('warehouse_admin', '/inventory'),
  ('sales_officer', '/inventory'),
  ('super_admin', '/requisitions'),
  ('admin', '/requisitions'),
  ('warehouse_admin', '/requisitions'),
  ('sales_officer', '/requisitions'),
  ('super_admin', '/inventory/receive'),
  ('admin', '/inventory/receive'),
  ('warehouse_admin', '/inventory/receive'),
  ('sales_officer', '/inventory/receive'),
  ('super_admin', '/inventory/opening'),
  ('admin', '/inventory/opening'),
  ('warehouse_admin', '/inventory/opening'),
  ('super_admin', '/inventory/adjust'),
  ('admin', '/inventory/adjust'),
  ('warehouse_admin', '/inventory/adjust'),
  ('super_admin', '/products'),
  ('admin', '/products'),
  ('warehouse_admin', '/products'),
  ('sales_officer', '/products'),
  ('super_admin', '/chemists'),
  ('admin', '/chemists'),
  ('sales_officer', '/chemists'),
  ('super_admin', '/doctors'),
  ('admin', '/doctors'),
  ('sales_officer', '/doctors'),
  ('super_admin', '/sales-officers'),
  ('super_admin', '/territories'),
  ('admin', '/territories'),
  ('super_admin', '/master/pack-size'),
  ('admin', '/master/pack-size'),
  ('warehouse_admin', '/master/pack-size'),
  ('super_admin', '/master/expense-categories'),
  ('admin', '/master/expense-categories'),
  ('finance_admin', '/master/expense-categories'),
  ('super_admin', '/master/uom'),
  ('admin', '/master/uom'),
  ('warehouse_admin', '/master/uom'),
  ('super_admin', '/master/strength'),
  ('admin', '/master/strength'),
  ('warehouse_admin', '/master/strength'),
  ('super_admin', '/master/generic-name'),
  ('admin', '/master/generic-name'),
  ('warehouse_admin', '/master/generic-name'),
  ('super_admin', '/wallet'),
  ('admin', '/wallet'),
  ('finance_admin', '/wallet'),
  ('sales_officer', '/wallet'),
  ('super_admin', '/deposits'),
  ('admin', '/deposits'),
  ('finance_admin', '/deposits'),
  ('sales_officer', '/deposits'),
  ('super_admin', '/expenses'),
  ('admin', '/expenses'),
  ('finance_admin', '/expenses'),
  ('sales_officer', '/expenses'),
  ('super_admin', '/users'),
  ('admin', '/users'),
  ('super_admin', '/role-access'),
  ('super_admin', '/settings'),
  ('admin', '/settings'),
  ('super_admin', '/audit'),
  ('admin', '/audit')
) as r(role, menu_key)
where not exists (select 1 from public.role_menus);

insert into public.role_menus (role, menu_key)
select role::public.app_role, 'report:' || key
from (values
  ('super_admin'), ('admin'), ('finance_admin'), ('sales_officer')
) as money(role)
cross join (values
  ('outstanding'), ('so'), ('product'), ('collections'), ('discounts')
) as reports(key)
where not exists (select 1 from public.role_menus where menu_key like 'report:%');

insert into public.role_menus (role, menu_key)
select role::public.app_role, 'report:' || key
from (values
  ('super_admin'), ('admin'), ('warehouse_admin'), ('sales_officer')
) as stock(role)
cross join (values
  ('stocklist'), ('batchstock'), ('stock'), ('expiry'), ('promo'), ('issue'), ('receive'), ('itemstock')
) as reports(key)
where not exists (
  select 1 from public.role_menus where menu_key = 'report:stocklist'
);

create or replace function public.list_role_menus()
returns table (role public.app_role, menu_key text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_user_id() is null then raise exception 'Not signed in'; end if;
  return query select m.role, m.menu_key from public.role_menus m order by m.role, m.menu_key;
end $$;

create or replace function public.set_role_menu(p_role public.app_role, p_menu_key text, p_allow boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Only Super Admin can change menu access';
  end if;
  if p_role = 'super_admin' and p_menu_key in ('/users', '/role-access', '/dashboard') and not p_allow then
    raise exception 'Super Admin must keep Dashboard, Users and Role access';
  end if;
  if p_allow then
    insert into public.role_menus (role, menu_key) values (p_role, p_menu_key)
    on conflict do nothing;
  else
    delete from public.role_menus where role = p_role and menu_key = p_menu_key;
  end if;
end $$;

drop function if exists public.list_user_accounts();
create or replace function public.list_user_accounts()
returns table (
  id uuid,
  email text,
  full_name text,
  password text,
  role public.app_role,
  avatar_path text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin')
     and not public.has_role(public.current_user_id(), 'admin') then
    raise exception 'Not authorized';
  end if;
  return query
  select
    p.id,
    p.email,
    p.full_name,
    case when public.has_role(public.current_user_id(), 'super_admin') then c.password else null end,
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = p.id
      order by case ur.role
        when 'super_admin' then 1
        when 'admin' then 2
        when 'finance_admin' then 3
        when 'warehouse_admin' then 4
        else 5
      end
      limit 1
    ),
    p.avatar_path,
    p.created_at
  from public.profiles p
  left join public.so_credentials c on c.user_id = p.id
  order by p.full_name, p.email;
end $$;

create or replace function public.assign_user_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = public as $$
declare v_others int;
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Only Super Admin can change roles';
  end if;
  select count(*) into v_others
  from public.user_roles
  where role = 'super_admin' and user_id <> p_user;
  if p_role <> 'super_admin' and v_others = 0
     and exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin') then
    raise exception 'Keep at least one Super Admin';
  end if;
  delete from public.user_roles where user_id = p_user and role <> p_role;
  insert into public.user_roles (user_id, role) values (p_user, p_role)
  on conflict (user_id, role) do nothing;
end $$;

create or replace function public.set_user_password(p_user uuid, p_password_hash text, p_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Only Super Admin can set a password';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if nullif(trim(p_password_hash), '') is null then
    raise exception 'Password could not be saved';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'User not found';
  end if;
  update public.users set password_hash = p_password_hash where id = p_user;
  insert into public.so_credentials (user_id, password) values (p_user, p_password)
  on conflict (user_id) do update set password = excluded.password, updated_at = now();
end $$;

grant execute on function public.list_role_menus() to biory_app;
grant execute on function public.set_role_menu(public.app_role, text, boolean) to biory_app;
grant execute on function public.list_user_accounts() to biory_app;
grant execute on function public.assign_user_role(uuid, public.app_role) to biory_app;
grant execute on function public.set_user_password(uuid, text, text) to biory_app;

insert into public.so_credentials (user_id, password)
select id, 'BioryAdmin@2026' from public.users where email = 'admin@biory.local'
on conflict (user_id) do nothing;

insert into public.so_credentials (user_id, password)
select id, 'Officer@2026' from public.users where email like 'officer%@biory.local'
on conflict (user_id) do nothing;

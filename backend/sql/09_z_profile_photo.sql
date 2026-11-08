-- Profile photos. The file itself stays under the caller's folder in the
-- profile-photos bucket. This column only stores that path.

alter table public.profiles add column if not exists avatar_path text;

create or replace function public.set_profile_photo(p_path text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_id() is null then raise exception 'Not authorized'; end if;
  if p_path is not null and p_path !~ ('^' || public.current_user_id()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$') then
    raise exception 'Invalid photo';
  end if;
  update public.profiles set avatar_path = p_path where id = public.current_user_id();
  perform public._audit('UPDATE', 'profiles', public.current_user_id()::text, jsonb_build_object('avatar_path', p_path), null);
end $$;

revoke all on function public.set_profile_photo(text) from public;
grant execute on function public.set_profile_photo(text) to biory_app;

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

grant execute on function public.list_user_accounts() to biory_app;

-- A Sales Officer sets a new password from the login page.
-- The new password stays visible to Super Admin on the Sales Officers list.
-- Safe to run again.

create or replace function public.reset_own_sales_officer_password(
  p_email text, p_password_hash text, p_password text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if nullif(trim(p_password_hash), '') is null then
    raise exception 'Password could not be saved';
  end if;
  select u.id into v_id
  from public.users u
  join public.user_roles r on r.user_id = u.id and r.role = 'sales_officer'
  join public.profiles p on p.id = u.id
  where u.email = lower(trim(p_email))
    and p.active;
  if v_id is null then
    raise exception 'No active Sales Officer uses that email';
  end if;
  update public.users set password_hash = p_password_hash where id = v_id;
  insert into public.so_credentials (user_id, password) values (v_id, p_password)
  on conflict (user_id) do update set password = excluded.password, updated_at = now();
  return v_id;
end $$;

grant execute on function public.reset_own_sales_officer_password(text, text, text) to biory_app;

-- Delete on chemist and doctor rows, plus edit and delete for Sales Officers.
-- Safe to run again.

drop policy if exists "chemists delete" on public.chemists;
create policy "chemists delete" on public.chemists for delete
  using (assigned_so = public.current_user_id() or public.is_admin(public.current_user_id()));

drop policy if exists "doctors delete" on public.doctors;
create policy "doctors delete" on public.doctors for delete
  using (assigned_so = public.current_user_id() or public.is_admin(public.current_user_id()));

create or replace function public.update_sales_officer(
  p_user uuid, p_full_name text, p_email text, p_phone text, p_territory uuid, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Only Super Admin can edit a Sales Officer';
  end if;
  if not public.has_role(p_user, 'sales_officer') then
    raise exception 'That account is not a Sales Officer';
  end if;
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'Enter a valid email';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Name is required';
  end if;
  update public.users
     set email = v_email,
         full_name = trim(p_full_name)
   where id = p_user;
  update public.profiles
     set email = v_email,
         full_name = trim(p_full_name),
         phone = nullif(trim(p_phone), ''),
         territory_id = p_territory,
         active = coalesce(p_active, active)
   where id = p_user;
exception
  when unique_violation then
    raise exception 'That email is already registered';
end $$;

create or replace function public.delete_sales_officer(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_loc uuid;
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Only Super Admin can delete a Sales Officer';
  end if;
  if not public.has_role(p_user, 'sales_officer') then
    raise exception 'That account is not a Sales Officer';
  end if;
  if exists (select 1 from public.orders where so_id = p_user)
     or exists (select 1 from public.requisitions where so_id = p_user)
     or exists (select 1 from public.deliveries where so_id = p_user)
     or exists (select 1 from public.collections where so_id = p_user)
     or exists (select 1 from public.deposits where so_id = p_user)
     or exists (select 1 from public.expenses where submitted_by = p_user)
     or exists (select 1 from public.doctor_visits where so_id = p_user)
     or exists (select 1 from public.wallet_ledger where so_id = p_user)
     or exists (
       select 1 from public.stock_movements m
        join public.locations l on l.id in (m.from_location, m.to_location)
       where l.so_id = p_user
     ) then
    raise exception 'This Sales Officer already has orders, stock, or money records and cannot be deleted';
  end if;
  update public.chemists set assigned_so = null where assigned_so = p_user;
  update public.doctors set assigned_so = null where assigned_so = p_user;
  select id into v_loc from public.locations where so_id = p_user;
  if v_loc is not null then
    delete from public.stock_balances where location_id = v_loc;
    delete from public.locations where id = v_loc;
  end if;
  delete from public.users where id = p_user;
end $$;

grant execute on function public.update_sales_officer(uuid, text, text, text, uuid, boolean) to biory_app;
grant execute on function public.delete_sales_officer(uuid) to biory_app;

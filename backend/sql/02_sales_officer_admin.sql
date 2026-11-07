-- Apply on an existing BIORY database. Safe to run more than once.
drop function if exists public.create_order(uuid, jsonb, numeric, numeric, text, uuid);

create or replace function public.create_order(p_chemist uuid, p_items jsonb, p_so_discount_pct numeric, p_extra_discount_pct numeric,
  p_remarks text, p_idempotency_key uuid, p_so uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s app_settings; c chemists; v_id uuid; v_no text; it jsonb; p products; v_factor numeric; v_qty int;
  v_loc uuid; v_avail int; v_tot_mrp numeric := 0; v_tot_trp numeric := 0; v_net numeric := 0; v_line_trp numeric;
  v_so uuid; v_so_amt numeric;
begin
  if p_idempotency_key is not null then
    select id into v_id from orders where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if public.has_role(public.current_user_id(), 'sales_officer') and (p_so is null or p_so = public.current_user_id()) then
    v_so := public.current_user_id();
  elsif public.has_role(public.current_user_id(), 'super_admin') then
    v_so := p_so;
    if v_so is null or not public.has_role(v_so, 'sales_officer') then raise exception 'Choose a Sales Officer'; end if;
  else
    raise exception 'Only Sales Officers can create orders';
  end if;
  select * into s from app_settings where id = 1;
  select * into c from chemists where id = p_chemist;
  if c.id is null or c.status <> 'active' then raise exception 'Chemist not found or inactive'; end if;
  if c.assigned_so is distinct from v_so and c.created_by is distinct from v_so then raise exception 'This chemist is not assigned to that Sales Officer'; end if;
  p_so_discount_pct := coalesce(p_so_discount_pct, 0); p_extra_discount_pct := coalesce(p_extra_discount_pct, 0);
  if p_so_discount_pct < 0 or p_so_discount_pct > s.so_discount_max_pct then raise exception 'SO discount must be between 0 and % percent', s.so_discount_max_pct; end if;
  if p_extra_discount_pct < 0 or p_extra_discount_pct > s.extra_discount_max_pct then raise exception 'Extra discount must be between 0 and % percent', s.extra_discount_max_pct; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;
  v_factor := 1 - (p_so_discount_pct + p_extra_discount_pct) / 100;
  v_loc := public.so_location(v_so);
  if v_loc is null then raise exception 'That Sales Officer has no stock location yet'; end if;
  perform 1 from locations where id = v_loc for update;

  v_no := public.next_doc_no('ORD');
  insert into orders(order_no, chemist_id, so_id, so_discount_pct, extra_discount_pct, remarks, idempotency_key)
  values (v_no, p_chemist, v_so, p_so_discount_pct, p_extra_discount_pct, p_remarks, p_idempotency_key) returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be whole numbers greater than zero'; end if;
    select * into p from products where id = (it->>'product_id')::uuid;
    if p.id is null or not p.active or p.kind <> 'saleable' then raise exception 'Product is not available for sale'; end if;
    v_avail := public._usable_qty(v_loc, p.id) - public._so_reserved(v_so, p.id);
    if v_qty > v_avail then raise exception '% — requested %, available %', p.name, v_qty, greatest(v_avail, 0); end if;
    v_line_trp := round(p.base_trp * v_qty, 2);
    insert into order_items(order_id, product_id, qty, mrp, trade_discount_pct, base_trp, net_unit_price, line_mrp, line_trp, line_net)
    values (v_id, p.id, v_qty, p.mrp, p.trade_discount_pct, p.base_trp, round(p.base_trp * v_factor, 4),
            round(p.mrp * v_qty, 2), v_line_trp, round(v_line_trp * v_factor, 2));
    v_tot_mrp := v_tot_mrp + round(p.mrp * v_qty, 2);
    v_tot_trp := v_tot_trp + v_line_trp;
    v_net := v_net + round(v_line_trp * v_factor, 2);
  end loop;

  v_so_amt := round(v_tot_trp * p_so_discount_pct / 100, 2);
  update orders set total_mrp = v_tot_mrp, total_base_trp = v_tot_trp,
    so_discount_amt = v_so_amt,
    extra_discount_amt = round(v_tot_trp - v_net - v_so_amt, 2),
    net_total = v_net, status = 'CONFIRMED', approval_reason = null
  where id = v_id;
  return v_id;
end $$;

-- Password Super Admin typed for a Sales Officer. Login still uses the hash on users.
-- No policies: only the functions below, running as the table owner, can read it.
create table if not exists public.so_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  password text not null,
  updated_at timestamptz not null default now()
);
alter table public.so_credentials enable row level security;

create or replace function public.create_sales_officer(
  p_email text, p_password_hash text, p_password text, p_full_name text, p_phone text, p_territory uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then raise exception 'Only Super Admin can add a Sales Officer'; end if;
  if v_email is null or position('@' in v_email) < 2 then raise exception 'Enter a valid email'; end if;
  if p_password is null or length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if nullif(trim(p_password_hash), '') is null then raise exception 'Password could not be saved'; end if;
  insert into public.users (email, password_hash, full_name, email_confirmed_at)
  values (v_email, p_password_hash, coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1)), now())
  returning id into v_id;
  update public.profiles
     set phone = nullif(trim(p_phone), ''),
         territory_id = p_territory,
         full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
   where id = v_id;
  insert into public.user_roles (user_id, role) values (v_id, 'sales_officer');
  insert into public.so_credentials (user_id, password) values (v_id, p_password);
  return v_id;
exception
  when unique_violation then
    raise exception 'That email is already registered';
end $$;

create or replace function public.reset_sales_officer_password(p_user uuid, p_password_hash text, p_password text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then raise exception 'Only Super Admin can reset a Sales Officer password'; end if;
  if p_password is null or length(p_password) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if not public.has_role(p_user, 'sales_officer') then raise exception 'That account is not a Sales Officer'; end if;
  update public.users set password_hash = p_password_hash where id = p_user;
  insert into public.so_credentials (user_id, password) values (p_user, p_password)
  on conflict (user_id) do update set password = excluded.password, updated_at = now();
end $$;

create or replace function public.forget_displayed_password(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_id() is distinct from p_user then raise exception 'Not authorized'; end if;
  delete from public.so_credentials where user_id = p_user;
end $$;

create or replace function public.list_sales_officers()
returns table (
  id uuid, email text, full_name text, phone text, territory_id uuid, so_code text,
  active boolean, login_password text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then raise exception 'Only Super Admin can view Sales Officer logins'; end if;
  return query
  select p.id, p.email, p.full_name, p.phone, p.territory_id, p.so_code, p.active, c.password, p.created_at
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role = 'sales_officer'
    left join public.so_credentials c on c.user_id = p.id
   order by p.full_name, p.email;
end $$;

create or replace function public.so_available_stock(p_so uuid)
returns table(product_id uuid, on_hand int, reserved int, available int)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_so is null or not public.has_role(p_so, 'sales_officer') then raise exception 'Choose a Sales Officer'; end if;
  if public.current_user_id() is distinct from p_so and not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Not authorized';
  end if;
  return query
  with oh as (
    select sb.product_id as pid, sum(sb.qty)::int as q
      from stock_balances sb
      join batches b on b.id = sb.batch_id
     where sb.location_id = public.so_location(p_so)
       and b.expiry_date > public.today_bd()
     group by sb.product_id
  )
  select oh.pid, oh.q, public._so_reserved(p_so, oh.pid), oh.q - public._so_reserved(p_so, oh.pid)
    from oh;
end $$;

grant execute on function public.create_order(uuid, jsonb, numeric, numeric, text, uuid, uuid) to biory_app;
grant execute on function public.create_sales_officer(text, text, text, text, text, uuid) to biory_app;
grant execute on function public.reset_sales_officer_password(uuid, text, text) to biory_app;
grant execute on function public.forget_displayed_password(uuid) to biory_app;
grant execute on function public.list_sales_officers() to biory_app;
grant execute on function public.so_available_stock(uuid) to biory_app;
revoke all on table public.so_credentials from biory_app;

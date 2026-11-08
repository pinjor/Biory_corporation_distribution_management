-- An order can be rewritten only before any delivery or collection.
-- Prices are recalculated from the product master and locked in again.

create or replace function public.update_order(
  p_id uuid,
  p_chemist uuid,
  p_items jsonb,
  p_so_discount_pct numeric,
  p_extra_discount_pct numeric,
  p_remarks text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  s app_settings;
  c chemists;
  it jsonb;
  p products;
  v_factor numeric;
  v_qty int;
  v_loc uuid;
  v_avail int;
  v_own int;
  v_tot_mrp numeric := 0;
  v_tot_trp numeric := 0;
  v_net numeric := 0;
  v_line_trp numeric;
  v_so_amt numeric;
  v_central boolean;
  v_seen uuid[] := '{}';
begin
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if not (
    (o.so_id = public.current_user_id() and public.has_role(public.current_user_id(), 'sales_officer'))
    or public.has_role(public.current_user_id(), 'super_admin')
  ) then
    raise exception 'Not authorized';
  end if;
  if o.status not in ('PENDING_APPROVAL', 'CONFIRMED')
     or o.delivery_status <> 'NOT_DELIVERED'
     or coalesce(o.delivered_value, 0) <> 0
     or coalesce(o.collected_value, 0) <> 0
     or exists (select 1 from order_items oi where oi.order_id = o.id and oi.delivered_qty > 0)
     or exists (select 1 from deliveries d where d.order_id = o.id) then
    raise exception 'This order can only be edited before delivery';
  end if;

  select * into s from app_settings where id = 1;
  select * into c from chemists where id = p_chemist;
  if c.id is null or c.status <> 'active' then raise exception 'Chemist not found or inactive'; end if;
  if c.assigned_so is distinct from o.so_id and c.created_by is distinct from o.so_id then
    raise exception 'This chemist is not assigned to that Sales Officer';
  end if;

  p_so_discount_pct := coalesce(p_so_discount_pct, 0);
  p_extra_discount_pct := coalesce(p_extra_discount_pct, 0);
  if p_so_discount_pct < 0 or p_so_discount_pct > s.so_discount_max_pct then
    raise exception 'SO discount must be between 0 and % percent', s.so_discount_max_pct;
  end if;
  if p_extra_discount_pct < 0 or p_extra_discount_pct > s.extra_discount_max_pct then
    raise exception 'Extra discount must be between 0 and % percent', s.extra_discount_max_pct;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;

  v_central := o.stock_from = 'central';
  v_factor := 1 - (p_so_discount_pct + p_extra_discount_pct) / 100;
  v_loc := case when v_central then public.central_location() else public.so_location(o.so_id) end;
  if v_loc is null then raise exception 'There is no stock location for this order'; end if;
  perform 1 from locations where id = v_loc for update;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be whole numbers greater than zero'; end if;
    select * into p from products where id = (it->>'product_id')::uuid;
    if p.id is null or not p.active or p.kind <> 'saleable' then raise exception 'Product is not available for sale'; end if;
    if p.id = any (v_seen) then raise exception 'Each product can appear only once'; end if;
    v_seen := v_seen || p.id;
    v_own := 0;
    select oi.qty into v_own from order_items oi where oi.order_id = o.id and oi.product_id = p.id;
    if v_central then
      v_avail := public._usable_qty(v_loc, p.id) - public._central_reserved(p.id) + v_own;
    else
      v_avail := public._usable_qty(v_loc, p.id) - public._so_reserved(o.so_id, p.id) + v_own;
    end if;
    if v_qty > v_avail then raise exception '% — requested %, available %', p.name, v_qty, greatest(v_avail, 0); end if;
  end loop;

  delete from order_items where order_id = o.id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    select * into p from products where id = (it->>'product_id')::uuid;
    v_line_trp := round(p.base_trp * v_qty, 2);
    insert into order_items(order_id, product_id, qty, mrp, trade_discount_pct, base_trp, net_unit_price, line_mrp, line_trp, line_net)
    values (o.id, p.id, v_qty, p.mrp, p.trade_discount_pct, p.base_trp, round(p.base_trp * v_factor, 4),
            round(p.mrp * v_qty, 2), v_line_trp, round(v_line_trp * v_factor, 2));
    v_tot_mrp := v_tot_mrp + round(p.mrp * v_qty, 2);
    v_tot_trp := v_tot_trp + v_line_trp;
    v_net := v_net + round(v_line_trp * v_factor, 2);
  end loop;

  v_so_amt := round(v_tot_trp * p_so_discount_pct / 100, 2);
  update orders set
    chemist_id = p_chemist,
    so_discount_pct = p_so_discount_pct,
    extra_discount_pct = p_extra_discount_pct,
    remarks = p_remarks,
    total_mrp = v_tot_mrp,
    total_base_trp = v_tot_trp,
    so_discount_amt = v_so_amt,
    extra_discount_amt = round(v_tot_trp - v_net - v_so_amt, 2),
    net_total = v_net
  where id = o.id;
  return o.id;
end $$;

grant execute on function public.update_order(uuid, uuid, jsonb, numeric, numeric, text) to biory_app;

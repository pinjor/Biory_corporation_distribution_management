-- Super Admin books a chemist shop from company stock, so an order can be saved
-- while the Sales Officer's own balance is still empty. Delivery then leaves the
-- central warehouse. A Sales Officer's own orders still use that officer's stock.

alter table public.orders add column if not exists stock_from text not null default 'so';
alter table public.orders drop constraint if exists orders_stock_from_check;
alter table public.orders add constraint orders_stock_from_check check (stock_from in ('so','central'));

create or replace function public._central_reserved(p_product uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.qty - oi.delivered_qty), 0)::int
    from order_items oi
    join orders o on o.id = oi.order_id
   where o.stock_from = 'central'
     and oi.product_id = p_product
     and o.status in ('PENDING_APPROVAL','CONFIRMED')
$$;

create or replace function public.central_available_stock()
returns table(product_id uuid, on_hand int, reserved int, available int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(public.current_user_id(), 'super_admin') then raise exception 'Not authorized'; end if;
  return query
  with oh as (
    select sb.product_id as pid, sum(sb.qty)::int as q
      from stock_balances sb
      join batches b on b.id = sb.batch_id
     where sb.location_id = public.central_location()
       and b.expiry_date > public.today_bd()
     group by sb.product_id
  )
  select oh.pid, oh.q, public._central_reserved(oh.pid), oh.q - public._central_reserved(oh.pid)
    from oh;
end $$;

create or replace function public.create_order(p_chemist uuid, p_items jsonb, p_so_discount_pct numeric, p_extra_discount_pct numeric,
  p_remarks text, p_idempotency_key uuid, p_so uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s app_settings; c chemists; v_id uuid; v_no text; it jsonb; p products; v_factor numeric; v_qty int;
  v_loc uuid; v_avail int; v_tot_mrp numeric := 0; v_tot_trp numeric := 0; v_net numeric := 0; v_line_trp numeric;
  v_so uuid; v_so_amt numeric; v_central boolean := false;
begin
  if p_idempotency_key is not null then
    select id into v_id from orders where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if public.has_role(public.current_user_id(), 'sales_officer') and (p_so is null or p_so = public.current_user_id()) then
    v_so := public.current_user_id();
  elsif public.has_role(public.current_user_id(), 'super_admin') then
    v_so := p_so;
    v_central := true;
    if v_so is null or not public.has_role(v_so, 'sales_officer') then raise exception 'That chemist shop has no Sales Officer'; end if;
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
  v_loc := case when v_central then public.central_location() else public.so_location(v_so) end;
  if v_loc is null then raise exception 'There is no stock location for this order'; end if;
  perform 1 from locations where id = v_loc for update;

  v_no := public.next_doc_no('ORD');
  insert into orders(order_no, chemist_id, so_id, so_discount_pct, extra_discount_pct, remarks, idempotency_key, stock_from)
  values (v_no, p_chemist, v_so, p_so_discount_pct, p_extra_discount_pct, p_remarks, p_idempotency_key,
          case when v_central then 'central' else 'so' end)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be whole numbers greater than zero'; end if;
    select * into p from products where id = (it->>'product_id')::uuid;
    if p.id is null or not p.active or p.kind <> 'saleable' then raise exception 'Product is not available for sale'; end if;
    if v_central then
      v_avail := public._usable_qty(v_loc, p.id) - public._central_reserved(p.id);
    else
      v_avail := public._usable_qty(v_loc, p.id) - public._so_reserved(v_so, p.id);
    end if;
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

create or replace function public.deliver_order(p_order uuid, p_items jsonb, p_remarks text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orders; v_id uuid; v_no text; it jsonb; oi order_items; a record; v_qty int; v_total numeric := 0; v_val numeric;
  v_loc uuid; v_full boolean := true; v_count int := 0;
begin
  if p_idempotency_key is not null then
    select id into v_id from deliveries where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.stock_from = 'central' then
    if o.so_id <> public.current_user_id() and not public.is_admin(public.current_user_id()) then
      raise exception 'Only an Admin or the order''s Sales Officer can deliver this order';
    end if;
    v_loc := public.central_location();
  else
    if o.so_id <> public.current_user_id() then raise exception 'Only the order''s SO can deliver from their stock'; end if;
    v_loc := public.so_location(o.so_id);
  end if;
  if o.status <> 'CONFIRMED' then raise exception 'Order must be confirmed before delivery (current: %)', o.status; end if;
  perform 1 from locations where id = v_loc for update;
  v_no := public.next_doc_no('DLV');
  insert into deliveries(delivery_no, order_id, so_id, chemist_id, delivery_type, remarks, idempotency_key)
  values (v_no, o.id, o.so_id, o.chemist_id, 'PARTIAL', p_remarks, p_idempotency_key) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    if v_qty < 0 then raise exception 'Quantities cannot be negative'; end if;
    continue when v_qty = 0;
    select * into oi from order_items where id = (it->>'order_item_id')::uuid and order_id = o.id for update;
    if oi.id is null then raise exception 'Unknown order line'; end if;
    if v_qty > oi.qty - oi.delivered_qty then raise exception 'Cannot deliver more than the remaining quantity'; end if;
    for a in select * from public._allocate_fefo(v_loc, oi.product_id, v_qty) loop
      v_val := round(a.o_qty * oi.net_unit_price, 2);
      insert into delivery_items(delivery_id, order_item_id, product_id, batch_id, qty, mrp, net_unit_price, line_value)
      values (v_id, oi.id, oi.product_id, a.o_batch_id, a.o_qty, oi.mrp, oi.net_unit_price, v_val);
      insert into stock_movements(product_id, batch_id, from_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
      values (oi.product_id, a.o_batch_id, v_loc, 'CUSTOMER_DELIVERY', a.o_qty, 'DELIVERY', v_id, v_no, public.current_user_id());
      v_total := v_total + v_val;
    end loop;
    update order_items set delivered_qty = delivered_qty + v_qty where id = oi.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Enter a quantity for at least one product'; end if;
  select bool_and(delivered_qty = qty) into v_full from order_items where order_id = o.id;
  if v_full and o.delivery_status = 'NOT_DELIVERED' then update deliveries set delivery_type = 'FULL' where id = v_id; end if;
  if v_full then
    v_val := o.net_total - (o.delivered_value + v_total);
    if abs(v_val) <= 1 and v_val <> 0 then
      update delivery_items set line_value = line_value + v_val
        where id = (select id from delivery_items where delivery_id = v_id order by line_value desc limit 1);
      v_total := v_total + v_val;
    end if;
  end if;
  update deliveries set total_value = v_total where id = v_id;
  update orders set delivered_value = delivered_value + v_total, first_delivered_at = coalesce(first_delivered_at, public.today_bd()) where id = o.id;
  perform public._refresh_order_status(o.id);
  return v_id;
end $$;

grant execute on function public.central_available_stock() to biory_app;
grant execute on function public.create_order(uuid, jsonb, numeric, numeric, text, uuid, uuid) to biory_app;
grant execute on function public.deliver_order(uuid, jsonb, text, uuid) to biory_app;
revoke execute on function public._central_reserved(uuid) from biory_app;

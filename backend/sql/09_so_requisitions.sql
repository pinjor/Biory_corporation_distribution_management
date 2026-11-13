-- Requisitions request stock for a Sales Officer.
-- Receipt always lands on that officer's location.

drop function if exists public.submit_requisition(jsonb, text, text, uuid);

create function public.submit_requisition(
  p_items jsonb,
  p_remarks text,
  p_party_kind text default null,
  p_party_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_name text;
begin
  if not public.has_role(public.current_user_id(), 'sales_officer') then
    raise exception 'Only Sales Officers can submit requisitions';
  end if;
  if public.so_location(public.current_user_id()) is null then
    raise exception 'You have no stock location';
  end if;
  if p_party_kind is not null or p_party_id is not null then
    if p_party_kind not in ('chemist','doctor') or p_party_id is null then
      raise exception 'Choose a chemist shop or a doctor';
    end if;
    if p_party_kind = 'chemist' then
      select business_name into v_name from chemists where id = p_party_id and status = 'active';
      if v_name is null then raise exception 'Chemist shop not found or inactive'; end if;
    else
      select name into v_name from doctors where id = p_party_id and status = 'active';
      if v_name is null then raise exception 'Doctor not found or inactive'; end if;
    end if;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;
  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks, created_by, party_kind, party_id)
  values (
    v_no, public.current_user_id(), 'SUBMITTED', p_remarks, public.current_user_id(),
    case when p_party_id is null then null else p_party_kind end,
    p_party_id
  )
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'qty')::int, 0) <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    insert into requisition_items(requisition_id, product_id, requested_qty)
    values (v_id, (it->>'product_id')::uuid, (it->>'qty')::int);
  end loop;
  perform public._notify_roles(
    array['warehouse_admin','super_admin']::public.app_role[],
    'New requisition ' || v_no,
    'Submitted and awaiting approval',
    '/requisitions/' || v_id
  );
  return v_id;
end $$;

drop function if exists public.submit_requisition_for(uuid, jsonb, text, boolean, text, uuid);

create function public.submit_requisition_for(
  p_so uuid,
  p_items jsonb,
  p_remarks text,
  p_approve boolean default false,
  p_party_kind text default null,
  p_party_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_qty int; v_pid uuid; v_name text;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Only Super Admin, Admin or Warehouse Admin can raise a requisition for a Sales Officer';
  end if;
  if p_party_id is not null then
    if p_party_kind not in ('chemist','doctor') then raise exception 'Choose a chemist shop or a doctor'; end if;
    if p_party_kind = 'chemist' then
      select business_name into v_name from chemists where id = p_party_id and status = 'active';
      if v_name is null then raise exception 'Chemist shop not found or inactive'; end if;
    else
      select name into v_name from doctors where id = p_party_id and status = 'active';
      if v_name is null then raise exception 'Doctor not found or inactive'; end if;
    end if;
  end if;
  if p_so is null then raise exception 'Choose a Sales Officer'; end if;
  if not public.has_role(p_so, 'sales_officer') then raise exception 'The assigned user is not a Sales Officer'; end if;
  if public.so_location(p_so) is null then raise exception 'That Sales Officer has no stock location'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;

  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks, created_by, party_kind, party_id)
  values (
    v_no, p_so, 'SUBMITTED', p_remarks, public.current_user_id(),
    case when p_party_id is null then null else p_party_kind end,
    p_party_id
  )
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    v_pid := (it->>'product_id')::uuid;
    if v_qty <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if not exists (select 1 from products where id = v_pid and active) then raise exception 'Unknown or inactive product'; end if;
    insert into requisition_items(requisition_id, product_id, requested_qty, approved_qty)
    values (v_id, v_pid, v_qty, case when p_approve then v_qty end);
  end loop;

  if p_approve then
    update requisitions set status = 'APPROVED', decided_by = public.current_user_id(), decided_at = now(),
      decision_note = 'Raised and approved by staff' where id = v_id;
  end if;
  perform public._notify_user(p_so, 'Requisition ' || v_no, 'Stock moves when it is issued and you confirm receipt', '/requisitions/' || v_id);
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'New requisition ' || v_no, coalesce(v_name, 'Sales Officer stock'), '/requisitions/' || v_id);
  return v_id;
end $$;

create or replace function public.update_requisition(p_id uuid, p_items jsonb, p_remarks text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.requisitions; it jsonb; v_qty int; v_pid uuid;
begin
  select * into r from public.requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.status <> 'SUBMITTED' then raise exception 'This requisition can no longer be edited'; end if;
  if r.so_id <> public.current_user_id() and not public.has_role(public.current_user_id(), 'super_admin') then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;
  delete from public.requisition_items where requisition_id = p_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    v_pid := (it->>'product_id')::uuid;
    if v_qty <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if not exists (select 1 from public.products where id = v_pid and active) then
      raise exception 'Unknown or inactive product';
    end if;
    insert into public.requisition_items(requisition_id, product_id, requested_qty)
    values (p_id, v_pid, v_qty);
  end loop;
  update public.requisitions set remarks = p_remarks where id = p_id;
end $$;

create or replace function public.receive_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; b record; v_transit uuid; v_dest uuid;
begin
  select * into r from requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.so_id <> public.current_user_id() and not public.is_admin(public.current_user_id()) then
    raise exception 'Only the requesting Sales Officer or an Admin can confirm receipt';
  end if;
  if r.status <> 'ISSUED' then raise exception 'Requisition has not been issued'; end if;
  if r.party_kind in ('chemist','doctor') then
    v_dest := public.party_location(r.party_kind, r.party_id);
  else
    v_dest := public.so_location(r.so_id);
  end if;
  if v_dest is null then raise exception 'There is nowhere to receive this stock'; end if;
  if not exists (select 1 from requisition_batches where requisition_id = p_id) then
    insert into requisition_batches(requisition_id, product_id, batch_id, qty)
    select p_id, sm.product_id, sm.batch_id, sm.qty
      from stock_movements sm
     where sm.reference_type = 'REQUISITION'
       and sm.reference_id = p_id
       and sm.movement_type = 'REQUISITION_ISSUE';
  end if;
  if not exists (select 1 from requisition_batches where requisition_id = p_id) then
    raise exception 'This requisition has no issued batches to receive';
  end if;
  v_transit := public.transit_location();
  perform 1 from locations where id = v_transit for update;
  perform 1 from locations where id = v_dest for update;
  for b in select * from requisition_batches where requisition_id = p_id loop
    insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
    values (b.product_id, b.batch_id, v_transit, v_dest, 'REQUISITION_RECEIPT', b.qty, 'REQUISITION', p_id, r.req_no, public.current_user_id());
  end loop;
  update requisitions set status = 'RECEIVED', received_at = now() where id = p_id;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[],
    'Stock received for ' || r.req_no, 'Receipt is confirmed', '/requisitions/' || p_id);
end $$;

create or replace function public.issue_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; ri record; a record; v_central uuid := public.central_location(); v_transit uuid;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into r from requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.status = 'SUBMITTED' then
    update requisition_items set approved_qty = requested_qty where requisition_id = p_id and approved_qty is null;
    update requisitions set status = 'APPROVED', decided_by = public.current_user_id(), decided_at = now(),
      decision_note = coalesce(decision_note, 'Approved on issue')
    where id = p_id;
    r.status := 'APPROVED';
  end if;
  if r.status not in ('APPROVED','PARTIALLY_APPROVED') then raise exception 'Requisition must be approved before issue'; end if;
  if exists (select 1 from requisition_batches where requisition_id = p_id) then raise exception 'This requisition was already issued'; end if;
  v_transit := public.transit_location();
  perform 1 from locations where id = v_central for update;
  perform 1 from locations where id = v_transit for update;
  for ri in select * from requisition_items where requisition_id = p_id and approved_qty > 0 loop
    for a in select * from public._allocate_fefo(v_central, ri.product_id, ri.approved_qty) loop
      insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
      values (ri.product_id, a.o_batch_id, v_central, v_transit, 'REQUISITION_ISSUE', a.o_qty, 'REQUISITION', p_id, r.req_no, public.current_user_id());
      insert into requisition_batches(requisition_id, product_id, batch_id, qty)
      values (p_id, ri.product_id, a.o_batch_id, a.o_qty);
    end loop;
    update requisition_items set issued_qty = approved_qty where id = ri.id;
  end loop;
  update requisitions set status = 'ISSUED', issued_by = public.current_user_id(), issued_at = now() where id = p_id;
  perform public._notify_user(r.so_id, 'Stock issued for ' || r.req_no, 'Check the issued lines, then receive them into your stock', '/inventory/receive/' || p_id);
end $$;

grant execute on function public.submit_requisition(jsonb, text, text, uuid) to biory_app;
grant execute on function public.submit_requisition_for(uuid, jsonb, text, boolean, text, uuid) to biory_app;
grant execute on function public.update_requisition(uuid, jsonb, text) to biory_app;
grant execute on function public.issue_requisition(uuid) to biory_app;
grant execute on function public.receive_requisition(uuid) to biory_app;

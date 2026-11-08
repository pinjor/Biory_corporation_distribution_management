-- Notifications go to the people who still have to act. The person who just did the
-- action is skipped, and Admin is included whenever Warehouse or Finance is.

create or replace function public._notify_user(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, body, link)
  select p_user, p_title, p_body, p_link
  where p_user is not null
    and p_user is distinct from public.current_user_id()
$$;

create or replace function public._notify_roles(p_roles public.app_role[], p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, body, link)
  select distinct ur.user_id, p_title, p_body, p_link
  from public.user_roles ur
  where ur.user_id is distinct from public.current_user_id()
    and (
      ur.role = any(p_roles)
      or (
        ur.role = 'admin'
        and p_roles && array['warehouse_admin','finance_admin']::public.app_role[]
      )
    )
$$;

revoke execute on function public._notify_user(uuid, text, text, text) from biory_app;
revoke execute on function public._notify_roles(public.app_role[], text, text, text) from biory_app;

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
  if exists (select 1 from requisition_batches where requisition_id = p_id) then
    v_transit := public.transit_location();
    perform 1 from locations where id = v_transit for update;
    perform 1 from locations where id = v_dest for update;
    for b in select * from requisition_batches where requisition_id = p_id loop
      insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
      values (b.product_id, b.batch_id, v_transit, v_dest, 'REQUISITION_RECEIPT', b.qty, 'REQUISITION', p_id, r.req_no, public.current_user_id());
    end loop;
  end if;
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
    end loop;
    update requisition_items set issued_qty = approved_qty where id = ri.id;
  end loop;
  update requisitions set status = 'ISSUED', issued_by = public.current_user_id(), issued_at = now() where id = p_id;
  perform public._notify_user(r.so_id, 'Stock issued for ' || r.req_no, 'Check the issued lines, then receive them into your stock', '/inventory/receive/' || p_id);
end $$;

grant execute on function public.issue_requisition(uuid) to biory_app;
grant execute on function public.receive_requisition(uuid) to biory_app;

-- An unread "stock issued" notice should open the receive page.
update public.notifications n
set link = '/inventory/receive/' || r.id::text
from public.requisitions r
where n.read_at is null
  and n.title = 'Stock issued for ' || r.req_no
  and r.status = 'ISSUED';

-- ============ STAFF-RAISED REQUISITIONS ============
-- Super Admin / Admin / Warehouse Admin can raise a requisition on behalf of a Sales Officer
-- (stock from the central warehouse to that SO), optionally approving it at once so it can be
-- issued straight away. Staff may also confirm receipt for an SO who cannot.

alter table public.requisitions add column if not exists created_by uuid references public.profiles(id);

create or replace function public.submit_requisition_for(p_so uuid, p_items jsonb, p_remarks text, p_approve boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_qty int; v_pid uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Only Super Admin, Admin or Warehouse Admin can raise a requisition for a Sales Officer';
  end if;
  if p_so is null or not public.has_role(p_so, 'sales_officer') then raise exception 'Choose a Sales Officer'; end if;
  if not exists (select 1 from profiles where id = p_so and active) then raise exception 'That Sales Officer is inactive'; end if;
  if public.so_location(p_so) is null then raise exception 'That Sales Officer has no stock location'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;

  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks, created_by)
  values (v_no, p_so, 'SUBMITTED', p_remarks, auth.uid()) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    v_pid := (it->>'product_id')::uuid;
    if v_qty <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if not exists (select 1 from products where id = v_pid and active) then raise exception 'Unknown or inactive product'; end if;
    insert into requisition_items(requisition_id, product_id, requested_qty, approved_qty)
    values (v_id, v_pid, v_qty, case when p_approve then v_qty end);
  end loop;

  if p_approve then
    update requisitions set status = 'APPROVED', decided_by = auth.uid(), decided_at = now(),
      decision_note = 'Raised and approved by staff' where id = v_id;
    perform public._notify_user(p_so, 'Requisition ' || v_no || ' raised for you', 'Approved — stock will be issued from the central warehouse', '/requisitions/' || v_id);
  else
    perform public._notify_user(p_so, 'Requisition ' || v_no || ' raised for you', 'Awaiting warehouse approval', '/requisitions/' || v_id);
    perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'New requisition ' || v_no, 'Raised by staff for an SO and awaiting approval', '/requisitions/' || v_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.submit_requisition_for(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.submit_requisition_for(uuid, jsonb, text, boolean) to authenticated;

-- Receipt can be confirmed by the SO, or by Super Admin / Admin on the SO's behalf.
create or replace function public.receive_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions;
begin
  select * into r from requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.so_id <> auth.uid() and not public.is_admin(auth.uid()) then raise exception 'Only the requesting SO or an Admin can confirm receipt'; end if;
  if r.status <> 'ISSUED' then raise exception 'Requisition has not been issued'; end if;
  update requisitions set status = 'RECEIVED', received_at = now() where id = p_id;
end $$;

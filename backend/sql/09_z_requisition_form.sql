-- Save a requisition as a draft, or submit it for approval.
-- Runs after 09_so_requisitions.sql because the filename sorts later.

create or replace function public.save_requisition(
  p_id uuid,
  p_so uuid,
  p_items jsonb,
  p_remarks text,
  p_submit boolean default false,
  p_approve boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.requisitions;
  it jsonb;
  v_id uuid;
  v_no text;
  v_qty int;
  v_pid uuid;
  v_so uuid;
  v_staff boolean;
  v_was text;
begin
  v_staff := public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]);
  if public.has_role(public.current_user_id(), 'sales_officer') and not v_staff then
    v_so := public.current_user_id();
  else
    if not v_staff then raise exception 'Not authorized'; end if;
    v_so := p_so;
  end if;
  if v_so is null then raise exception 'Choose who the requisition is for'; end if;
  if not public.has_role(v_so, 'sales_officer') then raise exception 'The assigned user is not a Sales Officer'; end if;
  if public.so_location(v_so) is null then raise exception 'That Sales Officer has no stock location'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product';
  end if;

  if p_id is not null then
    select * into r from public.requisitions where id = p_id for update;
    if r.id is null then raise exception 'Requisition not found'; end if;
    if r.status not in ('DRAFT', 'SUBMITTED') then
      raise exception 'This requisition can no longer be edited';
    end if;
    if r.so_id <> public.current_user_id() and not v_staff then
      raise exception 'Not authorized';
    end if;
    if v_staff and r.so_id is distinct from v_so and r.status = 'DRAFT' then
      update public.requisitions set so_id = v_so where id = p_id;
    end if;
    v_id := p_id;
    v_was := r.status;
    delete from public.requisition_items where requisition_id = p_id;
  else
    v_no := public.next_doc_no('REQ');
    insert into public.requisitions(req_no, so_id, status, remarks, created_by)
    values (v_no, v_so, 'DRAFT', p_remarks, public.current_user_id())
    returning id into v_id;
    v_was := 'DRAFT';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    v_pid := (it->>'product_id')::uuid;
    if v_qty <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if not exists (select 1 from public.products where id = v_pid and active) then
      raise exception 'Unknown or inactive product';
    end if;
    insert into public.requisition_items(requisition_id, product_id, requested_qty, approved_qty)
    values (v_id, v_pid, v_qty, case when p_submit and p_approve and v_staff then v_qty end);
  end loop;

  if p_submit and p_approve and v_staff then
    update public.requisitions
       set remarks = p_remarks,
           status = 'APPROVED',
           decided_by = public.current_user_id(),
           decided_at = now(),
           decision_note = 'Raised and approved by staff'
     where id = v_id;
  elsif p_submit then
    update public.requisitions set remarks = p_remarks, status = 'SUBMITTED' where id = v_id;
  else
    update public.requisitions set remarks = p_remarks where id = v_id;
  end if;

  if p_submit and v_was = 'DRAFT' and not (p_approve and v_staff) then
    select req_no into v_no from public.requisitions where id = v_id;
    perform public._notify_user(v_so, 'Requisition ' || v_no, 'Stock moves when it is issued and you confirm receipt', '/requisitions/' || v_id);
    perform public._notify_roles(
      array['warehouse_admin','super_admin']::public.app_role[],
      'New requisition ' || v_no,
      'Submitted and awaiting approval',
      '/requisitions/' || v_id
    );
  end if;
  return v_id;
end $$;

grant execute on function public.save_requisition(uuid, uuid, jsonb, text, boolean, boolean) to biory_app;

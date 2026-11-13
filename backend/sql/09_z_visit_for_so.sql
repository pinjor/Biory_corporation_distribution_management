-- Super Admin can record a doctor visit for any Sales Officer, or for himself.
drop function if exists public.record_doctor_visit(uuid, date, time, time, numeric, numeric, text, text, jsonb, uuid);

create or replace function public.record_doctor_visit(p_doctor uuid, p_date date, p_start time, p_end time, p_lat numeric, p_lng numeric,
  p_purpose text, p_notes text, p_items jsonb, p_idempotency_key uuid, p_so uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d doctors; v_id uuid; v_no text; it jsonb; a record; v_loc uuid; p products; v_qty int; v_so uuid; v_self boolean;
begin
  if p_idempotency_key is not null then
    select id into v_id from doctor_visits where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  v_so := coalesce(p_so, public.current_user_id());
  if p_so is not null and p_so is distinct from public.current_user_id() then
    if not public.has_role(public.current_user_id(), 'super_admin') then raise exception 'Not authorized'; end if;
    if not public.has_role(p_so, 'sales_officer') then raise exception 'Choose a Sales Officer'; end if;
  end if;
  v_self := v_so = public.current_user_id() and public.has_role(public.current_user_id(), 'super_admin') and not public.has_role(v_so, 'sales_officer');
  if not public.has_role(v_so, 'sales_officer') and not v_self then raise exception 'Only Sales Officers can record visits'; end if;
  select * into d from doctors where id = p_doctor;
  if d.id is null or d.status <> 'active' then raise exception 'Doctor not found or inactive'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'End time must be after start time'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Visit date cannot be in the future'; end if;
  v_loc := public.so_location(v_so);
  if v_loc is not null then
    perform 1 from locations where id = v_loc for update;
  end if;
  v_no := public.next_doc_no('VIS');
  insert into doctor_visits(visit_no, doctor_id, so_id, visit_date, start_time, end_time, latitude, longitude, purpose, notes, idempotency_key)
  values (v_no, p_doctor, v_so, coalesce(p_date, public.today_bd()), p_start, p_end, p_lat, p_lng, p_purpose, p_notes, p_idempotency_key)
  returning id into v_id;
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for it in select * from jsonb_array_elements(p_items) loop
      v_qty := coalesce((it->>'qty')::int, 0);
      if v_qty < 0 then raise exception 'Quantities cannot be negative'; end if;
      continue when v_qty = 0;
      if v_loc is null then raise exception 'That Sales Officer has no stock location'; end if;
      select * into p from products where id = (it->>'product_id')::uuid;
      if p.id is null or p.kind <> 'promotional' then raise exception 'Only promotional products can be given on visits'; end if;
      for a in select * from public._allocate_fefo(v_loc, p.id, v_qty) loop
        insert into visit_items(visit_id, product_id, batch_id, qty) values (v_id, p.id, a.o_batch_id, a.o_qty);
        insert into stock_movements(product_id, batch_id, from_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
        values (p.id, a.o_batch_id, v_loc, 'DOCTOR_PROMOTION', a.o_qty, 'VISIT', v_id, v_no, public.current_user_id());
      end loop;
    end loop;
  end if;
  return v_id;
end $$;

grant execute on function public.record_doctor_visit(uuid, date, time, time, numeric, numeric, text, text, jsonb, uuid, uuid) to biory_app;

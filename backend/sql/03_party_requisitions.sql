-- Chemist shops and doctors can request stock.
-- Super Admin issue takes it off the central (company) balance into transit.
-- Confirming receipt puts that same stock on the chemist or doctor balance.

alter table public.locations add column if not exists chemist_id uuid references public.chemists(id);
alter table public.locations add column if not exists doctor_id uuid references public.doctors(id);

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'locations' and con.contype = 'c'
  loop
    execute format('alter table public.locations drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.locations add constraint locations_kind_check
  check (kind in ('central','so','transit','chemist','doctor'));
alter table public.locations add constraint locations_party_check check (
  (kind = 'central' and so_id is null and chemist_id is null and doctor_id is null)
  or (kind = 'transit' and so_id is null and chemist_id is null and doctor_id is null)
  or (kind = 'so' and so_id is not null and chemist_id is null and doctor_id is null)
  or (kind = 'chemist' and chemist_id is not null and so_id is null and doctor_id is null)
  or (kind = 'doctor' and doctor_id is not null and so_id is null and chemist_id is null)
);

create unique index if not exists locations_chemist_uq on public.locations (chemist_id) where chemist_id is not null;
create unique index if not exists locations_doctor_uq on public.locations (doctor_id) where doctor_id is not null;

insert into public.locations (kind, name)
select 'transit', 'In transit'
where not exists (select 1 from public.locations where kind = 'transit');

alter table public.requisitions add column if not exists party_kind text;
alter table public.requisitions add column if not exists party_id uuid;
alter table public.requisitions drop constraint if exists requisitions_party_kind_check;
alter table public.requisitions add constraint requisitions_party_kind_check
  check (party_kind is null or party_kind in ('chemist','doctor'));

create table if not exists public.requisition_batches (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.requisitions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  qty int not null check (qty > 0)
);
alter table public.requisition_batches enable row level security;
drop policy if exists "req batches read" on public.requisition_batches;
create policy "req batches read" on public.requisition_batches for select
  using (exists (select 1 from public.requisitions r where r.id = requisition_id));

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'stock_movements' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%movement_type%'
  loop
    execute format('alter table public.stock_movements drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.stock_movements add constraint stock_movements_movement_type_check
  check (movement_type in (
    'OPENING','PURCHASE_RECEIPT','CENTRAL_TO_SO_TRANSFER','SO_TO_CENTRAL_RETURN','SO_TO_SO_TRANSFER',
    'CUSTOMER_DELIVERY','CUSTOMER_RETURN','DOCTOR_PROMOTION','DAMAGE','EXPIRED','LOSS',
    'MANUAL_ADJUSTMENT_IN','MANUAL_ADJUSTMENT_OUT','TRANSFER_REVERSAL','DELIVERY_REVERSAL',
    'REQUISITION_ISSUE','REQUISITION_RECEIPT'
  ));

create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_exp date; v_pid uuid;
begin
  select expiry_date, product_id into v_exp, v_pid from batches where id = new.batch_id;
  if v_pid <> new.product_id then raise exception 'Batch does not belong to product'; end if;
  if new.movement_type in (
       'CENTRAL_TO_SO_TRANSFER','SO_TO_SO_TRANSFER','CUSTOMER_DELIVERY','DOCTOR_PROMOTION',
       'REQUISITION_ISSUE','REQUISITION_RECEIPT')
     and v_exp <= public.today_bd() then
    raise exception 'Batch has expired and cannot be issued, transferred, delivered or promoted';
  end if;
  if new.from_location is not null then
    update stock_balances set qty = qty - new.qty, updated_at = now()
      where location_id = new.from_location and batch_id = new.batch_id and qty >= new.qty;
    if not found then raise exception 'Insufficient stock in batch for this movement'; end if;
  end if;
  if new.to_location is not null then
    insert into stock_balances(location_id, batch_id, product_id, qty)
    values (new.to_location, new.batch_id, new.product_id, new.qty)
    on conflict (location_id, batch_id) do update set qty = stock_balances.qty + excluded.qty, updated_at = now();
  end if;
  return new;
end $$;

create or replace function public.can_view_location(_loc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.locations l
    left join public.chemists c on c.id = l.chemist_id
    left join public.doctors d on d.id = l.doctor_id
    where l.id = _loc
      and (
        l.kind = 'central'
        or l.so_id = public.current_user_id()
        or c.assigned_so = public.current_user_id()
        or d.assigned_so = public.current_user_id()
        or public.is_staff(public.current_user_id())
      )
  )
$$;

create or replace function public.transit_location() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.locations where kind = 'transit' order by created_at limit 1;
  if v_id is null then
    insert into public.locations (kind, name) values ('transit', 'In transit') returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.party_location(p_kind text, p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if p_kind = 'chemist' then
    select id into v_id from public.locations where chemist_id = p_id;
    if v_id is not null then return v_id; end if;
    select business_name into v_name from public.chemists where id = p_id;
    if v_name is null then raise exception 'Chemist shop not found'; end if;
    insert into public.locations (kind, name, chemist_id) values ('chemist', v_name, p_id) returning id into v_id;
    return v_id;
  elsif p_kind = 'doctor' then
    select id into v_id from public.locations where doctor_id = p_id;
    if v_id is not null then return v_id; end if;
    select name into v_name from public.doctors where id = p_id;
    if v_name is null then raise exception 'Doctor not found'; end if;
    insert into public.locations (kind, name, doctor_id) values ('doctor', v_name, p_id) returning id into v_id;
    return v_id;
  end if;
  raise exception 'Choose a chemist shop or a doctor';
end $$;

drop function if exists public.submit_requisition(jsonb, text);
drop function if exists public.submit_requisition(jsonb, text, text, uuid);

create or replace function public.submit_requisition(p_items jsonb, p_remarks text, p_party_kind text, p_party_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_name text;
begin
  if not public.has_role(public.current_user_id(), 'sales_officer') then raise exception 'Only Sales Officers can submit requisitions'; end if;
  if p_party_kind not in ('chemist','doctor') or p_party_id is null then raise exception 'Choose a chemist shop or a doctor'; end if;
  if p_party_kind = 'chemist' then
    select business_name into v_name from chemists
     where id = p_party_id and status = 'active'
       and (assigned_so = public.current_user_id() or created_by = public.current_user_id());
    if v_name is null then raise exception 'That chemist shop is not assigned to you'; end if;
  else
    select name into v_name from doctors
     where id = p_party_id and status = 'active'
       and (assigned_so = public.current_user_id() or created_by = public.current_user_id());
    if v_name is null then raise exception 'That doctor is not assigned to you'; end if;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;
  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks, created_by, party_kind, party_id)
  values (v_no, public.current_user_id(), 'SUBMITTED', p_remarks, public.current_user_id(), p_party_kind, p_party_id)
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'qty')::int, 0) <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    insert into requisition_items(requisition_id, product_id, requested_qty)
    values (v_id, (it->>'product_id')::uuid, (it->>'qty')::int);
  end loop;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'New requisition ' || v_no, 'Submitted for ' || v_name, '/requisitions/' || v_id);
  return v_id;
end $$;

drop function if exists public.submit_requisition_for(uuid, jsonb, text, boolean);
drop function if exists public.submit_requisition_for(uuid, jsonb, text, boolean, text, uuid);

create or replace function public.submit_requisition_for(
  p_so uuid, p_items jsonb, p_remarks text, p_approve boolean, p_party_kind text, p_party_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_qty int; v_pid uuid; v_name text; v_assigned uuid;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Only Super Admin, Admin or Warehouse Admin can raise a requisition for a Sales Officer';
  end if;
  if p_party_kind not in ('chemist','doctor') or p_party_id is null then raise exception 'Choose a chemist shop or a doctor'; end if;
  if p_party_kind = 'chemist' then
    select business_name, assigned_so into v_name, v_assigned from chemists where id = p_party_id and status = 'active';
    if v_name is null then raise exception 'Chemist shop not found or inactive'; end if;
  else
    select name, assigned_so into v_name, v_assigned from doctors where id = p_party_id and status = 'active';
    if v_name is null then raise exception 'Doctor not found or inactive'; end if;
  end if;
  if v_assigned is null then raise exception 'Assign a Sales Officer to this party first'; end if;
  if p_so is not null and p_so is distinct from v_assigned then raise exception 'That party is assigned to a different Sales Officer'; end if;
  p_so := v_assigned;
  if not public.has_role(p_so, 'sales_officer') then raise exception 'The assigned user is not a Sales Officer'; end if;
  if public.so_location(p_so) is null then raise exception 'That Sales Officer has no stock location'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;

  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks, created_by, party_kind, party_id)
  values (v_no, p_so, 'SUBMITTED', p_remarks, public.current_user_id(), p_party_kind, p_party_id)
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
  perform public._notify_user(p_so, 'Requisition ' || v_no || ' for ' || v_name, 'Stock will move when it is issued and received', '/requisitions/' || v_id);
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'New requisition ' || v_no, v_name, '/requisitions/' || v_id);
  return v_id;
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
  perform public._notify_user(r.so_id, 'Stock issued for ' || r.req_no, 'Confirm receipt to add it at the chemist or doctor', '/requisitions/' || p_id);
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
end $$;

grant select, insert, update, delete on table public.requisition_batches to biory_app;
grant execute on function public.submit_requisition(jsonb, text, text, uuid) to biory_app;
grant execute on function public.submit_requisition_for(uuid, jsonb, text, boolean, text, uuid) to biory_app;
grant execute on function public.issue_requisition(uuid) to biory_app;
grant execute on function public.receive_requisition(uuid) to biory_app;
revoke execute on function public.transit_location() from biory_app;
revoke execute on function public.party_location(text, uuid) from biory_app;

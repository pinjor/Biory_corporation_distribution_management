-- ============ CHALLANS, IN-TRANSIT STOCK, PRODUCT UOM + AUTO CODE ============
-- • Opening stock, purchase receipts, adjustments and requisition issues are posted as challans:
--   one header (challan no, date, reference) with many product lines, posted atomically.
-- • Issuing a requisition moves stock Central → "In Transit". The SO (or an Admin) receives the
--   challan, which moves it In Transit → the SO's stock. Only then can the SO sell it.
-- • Products get a unit of measure and an auto-generated code (P001, P002, …).

-- ---------- Products ----------
alter table public.products add column if not exists uom text;
update public.products set uom = 'Pot' where uom is null and pack_size ilike '%pot%';
update public.products set uom = 'Pcs' where uom is null and kind = 'promotional';

create sequence if not exists public.product_code_seq;
select setval('public.product_code_seq',
  greatest(1, coalesce((select max(substring(code from '^P(\d+)$')::int) from public.products where code ~ '^P\d+$'), 0)),
  (select exists (select 1 from public.products where code ~ '^P\d+$')));

create or replace function public.set_product_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.code is null or trim(new.code) = '' then
    loop
      v_code := 'P' || lpad(nextval('public.product_code_seq')::text, 3, '0');
      exit when not exists (select 1 from products where code = v_code);
    end loop;
    new.code := v_code;
  end if;
  return new;
end $$;
drop trigger if exists trg_product_code on public.products;
create trigger trg_product_code before insert on public.products for each row execute function public.set_product_code();

-- ---------- In-transit location + movement type ----------
alter table public.locations drop constraint if exists locations_kind_check;
alter table public.locations add constraint locations_kind_check check (kind in ('central','so','transit'));
insert into public.locations (kind, name)
  select 'transit', 'In Transit' where not exists (select 1 from public.locations where kind = 'transit');

create or replace function public.transit_location() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.locations where kind = 'transit' order by created_at limit 1
$$;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'OPENING','PURCHASE_RECEIPT','CENTRAL_TO_SO_TRANSFER','SO_TO_CENTRAL_RETURN','SO_TO_SO_TRANSFER',
  'CUSTOMER_DELIVERY','CUSTOMER_RETURN','DOCTOR_PROMOTION','DAMAGE','EXPIRED','LOSS',
  'MANUAL_ADJUSTMENT_IN','MANUAL_ADJUSTMENT_OUT','TRANSFER_REVERSAL','DELIVERY_REVERSAL','TRANSIT_RECEIPT'));

-- ---------- Challans ----------
create table if not exists public.stock_challans (
  id uuid primary key default gen_random_uuid(),
  challan_no text not null unique,
  kind text not null check (kind in ('OPENING','RECEIPT','ISSUE','ADJUSTMENT')),
  status text not null default 'POSTED' check (status in ('POSTED','IN_TRANSIT','RECEIVED')),
  challan_date date not null default public.today_bd(),
  from_location uuid references public.locations(id),
  to_location uuid references public.locations(id),
  so_id uuid references public.profiles(id),
  requisition_id uuid references public.requisitions(id),
  reference text,
  remarks text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  received_by uuid references public.profiles(id),
  received_at timestamptz,
  idempotency_key uuid unique
);
create index if not exists stock_challans_kind_idx on public.stock_challans (kind, created_at desc);
create index if not exists stock_challans_so_idx on public.stock_challans (so_id, status);
create index if not exists stock_challans_req_idx on public.stock_challans (requisition_id);

create table if not exists public.stock_challan_items (
  id uuid primary key default gen_random_uuid(),
  challan_id uuid not null references public.stock_challans(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  movement_type text not null,
  qty int not null check (qty > 0),
  remarks text
);
create index if not exists stock_challan_items_challan_idx on public.stock_challan_items (challan_id);

grant select on public.stock_challans, public.stock_challan_items to authenticated;
grant all on public.stock_challans, public.stock_challan_items to service_role;
alter table public.stock_challans enable row level security;
alter table public.stock_challan_items enable row level security;
drop policy if exists "challans read" on public.stock_challans;
create policy "challans read" on public.stock_challans for select to authenticated
  using (so_id = auth.uid() or public.is_staff(auth.uid()));
drop policy if exists "challan items read" on public.stock_challan_items;
create policy "challan items read" on public.stock_challan_items for select to authenticated
  using (exists (select 1 from public.stock_challans c where c.id = challan_id and (c.so_id = auth.uid() or public.is_staff(auth.uid()))));
drop trigger if exists trg_audit_challans on public.stock_challans;
create trigger trg_audit_challans after insert or update on public.stock_challans for each row execute function public.audit_row();

-- Find or create a batch; the same batch number must keep the same expiry.
create or replace function public._ensure_batch(p_product uuid, p_batch_no text, p_mfg date, p_expiry date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_batch uuid; v_exp date;
begin
  if p_expiry is null then raise exception 'Expiry date is required'; end if;
  if trim(coalesce(p_batch_no, '')) = '' then raise exception 'Batch number is required'; end if;
  select id, expiry_date into v_batch, v_exp from batches where product_id = p_product and batch_no = trim(p_batch_no);
  if v_batch is null then
    insert into batches(product_id, batch_no, mfg_date, expiry_date) values (p_product, trim(p_batch_no), p_mfg, p_expiry) returning id into v_batch;
  elsif v_exp <> p_expiry then
    raise exception 'Batch % already exists with a different expiry date (%)', p_batch_no, v_exp;
  end if;
  return v_batch;
end $$;
revoke execute on function public._ensure_batch(uuid, text, date, date) from public, anon, authenticated;

-- Opening stock / purchase receipt challan into the central warehouse.
-- p_items: [{product_id, batch_no, mfg_date?, expiry_date, qty, remarks?}]
create or replace function public.post_stock_challan(p_kind text, p_date date, p_reference text, p_remarks text,
  p_items jsonb, p_idempotency_key uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_pid uuid; v_batch uuid; v_qty int; v_type text; v_exp date; v_central uuid := public.central_location(); v_i int := 0;
begin
  if p_idempotency_key is not null then
    select id into v_id from stock_challans where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if p_kind not in ('OPENING','RECEIPT') then raise exception 'Invalid challan type'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product line'; end if;
  v_type := case when p_kind = 'OPENING' then 'OPENING' else 'PURCHASE_RECEIPT' end;
  v_no := public.next_doc_no(case when p_kind = 'OPENING' then 'OPN' else 'GRN' end);
  insert into stock_challans(challan_no, kind, status, challan_date, to_location, reference, remarks, idempotency_key)
  values (v_no, p_kind, 'POSTED', coalesce(p_date, public.today_bd()), v_central, nullif(trim(p_reference), ''), nullif(trim(p_remarks), ''), p_idempotency_key)
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_pid := (it->>'product_id')::uuid;
    v_qty := (it->>'qty')::int;
    v_exp := nullif(it->>'expiry_date', '')::date;
    if not exists (select 1 from products where id = v_pid) then raise exception 'Line %: choose a product', v_i; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Line %: quantity must be greater than zero', v_i; end if;
    if v_exp is null then raise exception 'Line %: expiry date is required', v_i; end if;
    if v_exp <= public.today_bd() then raise exception 'Line %: cannot receive an expired batch', v_i; end if;
    begin
      v_batch := public._ensure_batch(v_pid, it->>'batch_no', nullif(it->>'mfg_date', '')::date, v_exp);
    exception when others then raise exception 'Line %: %', v_i, sqlerrm;
    end;
    insert into stock_challan_items(challan_id, product_id, batch_id, movement_type, qty, remarks)
    values (v_id, v_pid, v_batch, v_type, v_qty, nullif(it->>'remarks', ''));
    insert into stock_movements(product_id, batch_id, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by, remarks)
    values (v_pid, v_batch, v_central, v_type, v_qty, 'CHALLAN', v_id, v_no, auth.uid(), coalesce(nullif(it->>'remarks', ''), p_remarks));
  end loop;
  return v_id;
end $$;

-- Adjustment challan at one location. p_items: [{batch_id, type, qty}]
create or replace function public.post_adjustment_challan(p_location uuid, p_date date, p_reason text, p_items jsonb,
  p_idempotency_key uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb; v_pid uuid; v_batch uuid; v_qty int; v_type text; v_i int := 0; v_in boolean;
begin
  if p_idempotency_key is not null then
    select id into v_id from stock_challans where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from locations where id = p_location and kind in ('central','so')) then raise exception 'Choose the central warehouse or an SO location'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'A reason is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line'; end if;
  v_no := public.next_doc_no('ADJ');
  insert into stock_challans(challan_no, kind, status, challan_date, from_location, to_location, so_id, remarks, idempotency_key)
  values (v_no, 'ADJUSTMENT', 'POSTED', coalesce(p_date, public.today_bd()), p_location, p_location,
          (select so_id from locations where id = p_location), trim(p_reason), p_idempotency_key)
  returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_batch := (it->>'batch_id')::uuid;
    v_type := it->>'type';
    v_qty := (it->>'qty')::int;
    if v_type not in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT','MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN') then raise exception 'Line %: invalid adjustment type', v_i; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Line %: quantity must be greater than zero', v_i; end if;
    select product_id into v_pid from batches where id = v_batch;
    if v_pid is null then raise exception 'Line %: choose a batch', v_i; end if;
    v_in := v_type in ('MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN');
    insert into stock_challan_items(challan_id, product_id, batch_id, movement_type, qty, remarks)
    values (v_id, v_pid, v_batch, v_type, v_qty, nullif(it->>'remarks', ''));
    begin
      insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by, remarks)
      values (v_pid, v_batch, case when v_in then null else p_location end, case when v_in then p_location else null end,
              v_type, v_qty, 'CHALLAN', v_id, v_no, auth.uid(), trim(p_reason));
    exception when others then raise exception 'Line %: %', v_i, sqlerrm;
    end;
  end loop;
  return v_id;
end $$;

-- Issue a requisition: create an ISSUE challan and move stock Central → In Transit (FEFO).
create or replace function public.issue_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; ri record; a record; v_central uuid := public.central_location(); v_transit uuid := public.transit_location();
  v_cid uuid; v_no text;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into r from requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.status not in ('APPROVED','PARTIALLY_APPROVED') then raise exception 'Requisition must be approved before issue'; end if;
  if public.so_location(r.so_id) is null then raise exception 'SO has no stock location'; end if;
  if v_transit is null then raise exception 'In-transit location is missing'; end if;
  v_no := public.next_doc_no('ISS');
  insert into stock_challans(challan_no, kind, status, from_location, to_location, so_id, requisition_id, reference, remarks)
  values (v_no, 'ISSUE', 'IN_TRANSIT', v_central, public.so_location(r.so_id), r.so_id, p_id, r.req_no, r.remarks)
  returning id into v_cid;
  for ri in select * from requisition_items where requisition_id = p_id and approved_qty > 0 loop
    for a in select * from public._allocate_fefo(v_central, ri.product_id, ri.approved_qty) loop
      insert into stock_challan_items(challan_id, product_id, batch_id, movement_type, qty)
      values (v_cid, ri.product_id, a.o_batch_id, 'CENTRAL_TO_SO_TRANSFER', a.o_qty);
      insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by, remarks)
      values (ri.product_id, a.o_batch_id, v_central, v_transit, 'CENTRAL_TO_SO_TRANSFER', a.o_qty, 'CHALLAN', v_cid, v_no, auth.uid(), 'Issued against ' || r.req_no);
    end loop;
    update requisition_items set issued_qty = approved_qty where id = ri.id;
  end loop;
  update requisitions set status = 'ISSUED', issued_by = auth.uid(), issued_at = now() where id = p_id;
  perform public._notify_user(r.so_id, 'Challan ' || v_no || ' is on its way', 'Receive it to add the stock to your inventory (' || r.req_no || ')', '/challans/' || v_cid);
end $$;

-- Receive an ISSUE challan: In Transit → SO stock. By the SO, or an Admin on their behalf.
create or replace function public.receive_challan(p_challan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c stock_challans; it record; v_transit uuid := public.transit_location();
begin
  select * into c from stock_challans where id = p_challan for update;
  if c.id is null then raise exception 'Challan not found'; end if;
  if c.kind <> 'ISSUE' then raise exception 'Only issue challans are received'; end if;
  if c.status <> 'IN_TRANSIT' then raise exception 'Challan % has already been received', c.challan_no; end if;
  if c.so_id <> auth.uid() and not public.is_admin(auth.uid()) then raise exception 'Only the receiving SO or an Admin can receive this challan'; end if;
  for it in select * from stock_challan_items where challan_id = p_challan loop
    insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by, remarks)
    values (it.product_id, it.batch_id, v_transit, c.to_location, 'TRANSIT_RECEIPT', it.qty, 'CHALLAN', c.id, c.challan_no, auth.uid(), 'Received by SO');
  end loop;
  update stock_challans set status = 'RECEIVED', received_by = auth.uid(), received_at = now() where id = p_challan;
  if c.requisition_id is not null then
    update requisitions set status = 'RECEIVED', received_at = now() where id = c.requisition_id and status = 'ISSUED';
  end if;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'Challan ' || c.challan_no || ' received', 'The SO confirmed receipt', '/challans/' || c.id);
end $$;

-- Confirming a requisition receipt now receives its in-transit challan (older issues had no challan).
create or replace function public.receive_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; v_cid uuid;
begin
  select * into r from requisitions where id = p_id for update;
  if r.id is null then raise exception 'Requisition not found'; end if;
  if r.so_id <> auth.uid() and not public.is_admin(auth.uid()) then raise exception 'Only the requesting SO or an Admin can confirm receipt'; end if;
  if r.status <> 'ISSUED' then raise exception 'Requisition has not been issued'; end if;
  select id into v_cid from stock_challans where requisition_id = p_id and kind = 'ISSUE' and status = 'IN_TRANSIT' limit 1;
  if v_cid is not null then
    perform public.receive_challan(v_cid);
  else
    update requisitions set status = 'RECEIVED', received_at = now() where id = p_id;
  end if;
end $$;

-- CSV opening-stock import now posts one opening challan.
create or replace function public.import_opening_stock(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_pid uuid; v_i int := 0; v_items jsonb := '[]'::jsonb;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No rows to import'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    select id into v_pid from products where code = trim(r->>'product_code');
    if v_pid is null then raise exception 'Row %: unknown product code %', v_i, r->>'product_code'; end if;
    v_items := v_items || jsonb_build_object('product_id', v_pid, 'batch_no', r->>'batch_no', 'mfg_date', r->>'mfg_date',
      'expiry_date', r->>'expiry_date', 'qty', r->>'qty', 'remarks', r->>'remarks');
  end loop;
  perform public.post_stock_challan('OPENING', public.today_bd(), 'CSV import', null, v_items, null);
  return v_i;
end $$;

grant execute on function public.post_stock_challan(text, date, text, text, jsonb, uuid) to authenticated;
grant execute on function public.post_adjustment_challan(uuid, date, text, jsonb, uuid) to authenticated;
grant execute on function public.receive_challan(uuid) to authenticated;
grant execute on function public.transit_location() to authenticated;

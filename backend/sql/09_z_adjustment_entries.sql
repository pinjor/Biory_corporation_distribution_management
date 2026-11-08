-- Stock adjustments are saved as a pending challan. Stock changes only when approved.

create table if not exists public.adjustment_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','CANCELLED')),
  entry_date date not null,
  location_id uuid not null references public.locations(id),
  remarks text,
  idempotency_key uuid unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz
);

create table if not exists public.adjustment_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.adjustment_entries(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  movement_type text not null check (movement_type in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT','MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN')),
  qty int not null check (qty > 0),
  reason text not null,
  remarks text
);

create index if not exists adjustment_entries_status_idx on public.adjustment_entries (status, created_at desc);
create index if not exists adjustment_entry_items_entry_idx on public.adjustment_entry_items (entry_id);

alter table public.adjustment_entries enable row level security;
alter table public.adjustment_entry_items enable row level security;

drop policy if exists "adjustment entries read" on public.adjustment_entries;
create policy "adjustment entries read" on public.adjustment_entries for select using (
  public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[])
);

drop policy if exists "adjustment items read" on public.adjustment_entry_items;
create policy "adjustment items read" on public.adjustment_entry_items for select using (
  exists (
    select 1 from public.adjustment_entries e
    where e.id = entry_id
      and public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[])
  )
);

grant select on public.adjustment_entries, public.adjustment_entry_items to biory_app;

create or replace function public.save_adjustment_entry(p_id uuid, p_date date, p_location uuid, p_items jsonb, p_remarks text, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_pid uuid; v_batch uuid; v_qty int; v_type text; v_reason text; v_out int; v_on int;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if p_idempotency_key is not null and p_id is null then
    select id into v_id from public.adjustment_entries where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if p_date is null then raise exception 'Entry date is required'; end if;
  if p_location is null or not exists (select 1 from public.locations where id = p_location and kind in ('central','so')) then
    raise exception 'Choose a store';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;
  if p_id is null then
    insert into public.adjustment_entries(entry_no, status, entry_date, location_id, remarks, idempotency_key, created_by)
    values (public.next_doc_no('ADJ'), 'PENDING', p_date, p_location, nullif(trim(coalesce(p_remarks, '')), ''), p_idempotency_key, public.current_user_id())
    returning id into v_id;
  else
    select id into v_id from public.adjustment_entries where id = p_id for update;
    if v_id is null then raise exception 'Adjustment not found'; end if;
    if (select status from public.adjustment_entries where id = v_id) <> 'PENDING' then
      raise exception 'Only a pending adjustment can be edited';
    end if;
    update public.adjustment_entries
      set entry_date = p_date, location_id = p_location, remarks = nullif(trim(coalesce(p_remarks, '')), '')
      where id = v_id;
    delete from public.adjustment_entry_items where entry_id = v_id;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid;
    v_batch := (it->>'batch_id')::uuid;
    v_qty := coalesce((it->>'qty')::int, 0);
    v_type := it->>'movement_type';
    v_reason := trim(coalesce(it->>'reason', ''));
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_reason = '' then raise exception 'A reason is required'; end if;
    if v_type not in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT','MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN') then
      raise exception 'Invalid adjustment type';
    end if;
    if not exists (select 1 from public.batches where id = v_batch and product_id = v_pid) then
      raise exception 'Batch does not belong to that product';
    end if;
    if v_type in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT') then
      select coalesce(sum(qty), 0) into v_out from public.adjustment_entry_items
        where entry_id = v_id and batch_id = v_batch
          and movement_type in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT');
      select coalesce(qty, 0) into v_on from public.stock_balances
        where location_id = p_location and batch_id = v_batch;
      if v_out + v_qty > coalesce(v_on, 0) then raise exception 'Not enough stock in that batch to decrease'; end if;
    end if;
    insert into public.adjustment_entry_items(entry_id, product_id, batch_id, movement_type, qty, reason, remarks)
    values (v_id, v_pid, v_batch, v_type, v_qty, v_reason, nullif(trim(coalesce(it->>'remarks', '')), ''));
  end loop;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[],
    'Adjustment ' || (select entry_no from public.adjustment_entries where id = v_id) || ' awaiting approval',
    'Stock changes only after approval', '/inventory/adjust');
  return v_id;
end $$;

create or replace function public.cancel_adjustment_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.adjustment_entries;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into r from public.adjustment_entries where id = p_id for update;
  if r.id is null then raise exception 'Adjustment not found'; end if;
  if r.status <> 'PENDING' then raise exception 'Only a pending adjustment can be deleted'; end if;
  update public.adjustment_entries set status = 'CANCELLED' where id = p_id;
end $$;

create or replace function public.approve_adjustment_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.adjustment_entries; line public.adjustment_entry_items; v_reason text;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into r from public.adjustment_entries where id = p_id for update;
  if r.id is null then raise exception 'Adjustment not found'; end if;
  if r.status <> 'PENDING' then raise exception 'Only a pending adjustment can be approved'; end if;
  for line in select * from public.adjustment_entry_items where entry_id = p_id loop
    v_reason := r.entry_no
      || case when r.remarks is not null then ' · ' || r.remarks else '' end
      || ' · ' || line.reason
      || case when line.remarks is not null then ' · ' || line.remarks else '' end;
    perform public.adjust_stock(r.location_id, line.batch_id, line.qty, line.movement_type, v_reason);
  end loop;
  update public.adjustment_entries
    set status = 'APPROVED', approved_by = public.current_user_id(), approved_at = now()
    where id = p_id;
  perform public._notify_user(r.created_by, 'Adjustment ' || r.entry_no || ' approved',
    'The store stock has been updated', '/inventory/adjust');
end $$;

grant execute on function public.save_adjustment_entry(uuid, date, uuid, jsonb, text, uuid) to biory_app;
grant execute on function public.cancel_adjustment_entry(uuid) to biory_app;
grant execute on function public.approve_adjustment_entry(uuid) to biory_app;

-- Opening stock is saved as a pending challan. Stock increases only when it is approved.

create table if not exists public.opening_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','CANCELLED')),
  entry_date date not null,
  remarks text,
  idempotency_key uuid unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz
);

create table if not exists public.opening_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.opening_entries(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_no text not null,
  mfg_date date,
  expiry_date date not null,
  qty int not null check (qty > 0),
  remarks text
);

create index if not exists opening_entries_status_idx on public.opening_entries (status, created_at desc);
create index if not exists opening_entry_items_entry_idx on public.opening_entry_items (entry_id);

alter table public.opening_entries enable row level security;
alter table public.opening_entry_items enable row level security;

drop policy if exists "opening entries read" on public.opening_entries;
create policy "opening entries read" on public.opening_entries for select using (
  public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[])
);

drop policy if exists "opening items read" on public.opening_entry_items;
create policy "opening items read" on public.opening_entry_items for select using (
  exists (
    select 1 from public.opening_entries e
    where e.id = entry_id
      and public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[])
  )
);

grant select on public.opening_entries, public.opening_entry_items to biory_app;

create or replace function public.save_opening_entry(p_id uuid, p_date date, p_items jsonb, p_remarks text, p_idempotency_key uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; it jsonb; v_pid uuid; v_qty int; v_batch text; v_expiry date; v_mfg date;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if p_idempotency_key is not null and p_id is null then
    select id into v_id from public.opening_entries where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if p_date is null then raise exception 'Entry date is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;
  if p_id is null then
    insert into public.opening_entries(entry_no, status, entry_date, remarks, idempotency_key, created_by)
    values (public.next_doc_no('OPN'), 'PENDING', p_date, nullif(trim(coalesce(p_remarks, '')), ''), p_idempotency_key, public.current_user_id())
    returning id into v_id;
  else
    select id into v_id from public.opening_entries where id = p_id for update;
    if v_id is null then raise exception 'Opening entry not found'; end if;
    if (select status from public.opening_entries where id = v_id) <> 'PENDING' then
      raise exception 'Only a pending opening entry can be edited';
    end if;
    update public.opening_entries
      set entry_date = p_date, remarks = nullif(trim(coalesce(p_remarks, '')), '')
      where id = v_id;
    delete from public.opening_entry_items where entry_id = v_id;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'product_id')::uuid;
    v_qty := coalesce((it->>'qty')::int, 0);
    v_batch := trim(coalesce(it->>'batch_no', ''));
    v_expiry := nullif(it->>'expiry', '')::date;
    v_mfg := nullif(it->>'mfg', '')::date;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_batch = '' then raise exception 'Batch number is required'; end if;
    if v_expiry is null then raise exception 'Expiry date is required'; end if;
    if v_expiry <= public.today_bd() then raise exception 'Cannot receive an expired batch'; end if;
    if v_mfg is not null and v_mfg > public.today_bd() then raise exception 'Manufacturing date cannot be in the future'; end if;
    if not exists (select 1 from public.products where id = v_pid and active) then raise exception 'Unknown or inactive product'; end if;
    insert into public.opening_entry_items(entry_id, product_id, batch_no, mfg_date, expiry_date, qty, remarks)
    values (v_id, v_pid, v_batch, v_mfg, v_expiry, v_qty, nullif(trim(coalesce(it->>'remarks', '')), ''));
  end loop;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[],
    'Opening ' || (select entry_no from public.opening_entries where id = v_id) || ' awaiting approval',
    'Stock is added only after approval', '/inventory/opening');
  return v_id;
end $$;

create or replace function public.cancel_opening_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.opening_entries;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into r from public.opening_entries where id = p_id for update;
  if r.id is null then raise exception 'Opening entry not found'; end if;
  if r.status <> 'PENDING' then raise exception 'Only a pending opening entry can be deleted'; end if;
  update public.opening_entries set status = 'CANCELLED' where id = p_id;
end $$;

create or replace function public.approve_opening_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.opening_entries; line public.opening_entry_items;
begin
  if not public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into r from public.opening_entries where id = p_id for update;
  if r.id is null then raise exception 'Opening entry not found'; end if;
  if r.status <> 'PENDING' then raise exception 'Only a pending opening entry can be approved'; end if;
  for line in select * from public.opening_entry_items where entry_id = p_id loop
    perform public.receive_stock(line.product_id, line.batch_no, line.mfg_date, line.expiry_date, line.qty, 'OPENING', r.entry_no, line.remarks);
  end loop;
  update public.opening_entries
    set status = 'APPROVED', approved_by = public.current_user_id(), approved_at = now()
    where id = p_id;
  perform public._notify_user(r.created_by, 'Opening ' || r.entry_no || ' approved',
    'The quantity has been added to the central warehouse', '/inventory/opening');
end $$;

grant execute on function public.save_opening_entry(uuid, date, jsonb, text, uuid) to biory_app;
grant execute on function public.cancel_opening_entry(uuid) to biory_app;
grant execute on function public.approve_opening_entry(uuid) to biory_app;

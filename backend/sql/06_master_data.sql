-- Lookup lists for product attributes and expense categories, plus automatic product codes.
-- Safe to run again: objects are created only when missing and seeds ignore duplicates.

create table if not exists public.master_values (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pack_size', 'expense_category', 'uom', 'strength', 'generic_name')),
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint master_values_kind_name unique (kind, name)
);

create unique index if not exists master_values_kind_code
  on public.master_values (kind, code) where code is not null;
create index if not exists master_values_kind_active on public.master_values (kind, active);

alter table public.master_values enable row level security;

drop policy if exists "master values read" on public.master_values;
create policy "master values read" on public.master_values for select using (true);

drop policy if exists "master values write" on public.master_values;
create policy "master values write" on public.master_values for all
  using (
    (kind = 'expense_category' and public.has_any_role(public.current_user_id(), array['super_admin','admin','finance_admin']::public.app_role[]))
    or (kind <> 'expense_category' and public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]))
  )
  with check (
    (kind = 'expense_category' and public.has_any_role(public.current_user_id(), array['super_admin','admin','finance_admin']::public.app_role[]))
    or (kind <> 'expense_category' and public.has_any_role(public.current_user_id(), array['super_admin','admin','warehouse_admin']::public.app_role[]))
  );

grant select, insert, update, delete on table public.master_values to biory_app;

insert into public.master_values (kind, name, code) values
  ('expense_category', 'Travel / conveyance', 'TRAVEL'),
  ('expense_category', 'Fuel', 'FUEL'),
  ('expense_category', 'Food / daily allowance', 'FOOD'),
  ('expense_category', 'Accommodation', 'ACCOMMODATION'),
  ('expense_category', 'Mobile / internet', 'COMMUNICATION'),
  ('expense_category', 'Client entertainment', 'ENTERTAINMENT'),
  ('expense_category', 'Office supplies', 'OFFICE'),
  ('expense_category', 'Other', 'OTHER')
on conflict (kind, name) do nothing;

insert into public.master_values (kind, name)
select 'pack_size', btrim(pack_size)
from public.products
where pack_size is not null and btrim(pack_size) <> ''
on conflict (kind, name) do nothing;

insert into public.master_values (kind, name)
select 'generic_name', btrim(generic_name)
from public.products
where generic_name is not null and btrim(generic_name) <> ''
on conflict (kind, name) do nothing;

insert into public.master_values (kind, name)
select 'strength', btrim(strength)
from public.products
where strength is not null and btrim(strength) <> ''
on conflict (kind, name) do nothing;

insert into public.master_values (kind, name) values
  ('uom', 'Pot'),
  ('uom', 'Strip'),
  ('uom', 'Bottle'),
  ('uom', 'Box'),
  ('uom', 'Piece'),
  ('uom', 'Tube'),
  ('uom', 'Vial'),
  ('uom', 'Sachet')
on conflict (kind, name) do nothing;

alter table public.products add column if not exists uom text;

-- A blank code becomes the next P001-style number. A code the user typed is kept.
create or replace function public.assign_product_code() returns trigger
language plpgsql as $$
declare n int;
begin
  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtext('biory-product-code'));
    select coalesce(max(substring(code from '^P([0-9]+)$')::int), 0) + 1
      into n
      from public.products
      where code ~ '^P[0-9]+$';
    new.code := 'P' || lpad(n::text, 3, '0');
  else
    new.code := btrim(new.code);
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_product_code on public.products;
create trigger trg_assign_product_code
  before insert on public.products
  for each row execute function public.assign_product_code();

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'expenses' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.expenses drop constraint %I', r.conname);
  end loop;
end $$;

create or replace function public.submit_expense(p_date date, p_category text, p_amount numeric, p_description text,
  p_receipt_paths text[], p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; v_path text; v_name text; v_cat text; v_code text;
begin
  if public.current_user_id() is null then raise exception 'Not signed in'; end if;
  if p_idempotency_key is not null then
    select id into v_id from expenses where idempotency_key = p_idempotency_key and submitted_by = public.current_user_id();
    if v_id is not null then return v_id; end if;
  end if;
  if not exists (select 1 from user_roles where user_id = public.current_user_id()) then raise exception 'You need a role before submitting expenses'; end if;
  v_code := upper(trim(coalesce(p_category, '')));
  select name into v_cat from master_values where kind = 'expense_category' and active and code = v_code;
  if v_cat is null then raise exception 'Choose a valid category'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if trim(coalesce(p_description,'')) = '' then raise exception 'Describe what the expense was for'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Expense date cannot be in the future'; end if;
  if coalesce(array_length(p_receipt_paths, 1), 0) > 5 then raise exception 'Attach at most 5 receipts'; end if;
  if p_receipt_paths is not null then
    foreach v_path in array p_receipt_paths loop
      if v_path not like public.current_user_id()::text || '/%' then raise exception 'Invalid receipt attachment'; end if;
    end loop;
  end if;
  v_no := public.next_doc_no('EXP');
  insert into expenses(expense_no, submitted_by, expense_date, category, amount, description, receipt_paths, idempotency_key)
  values (v_no, public.current_user_id(), coalesce(p_date, public.today_bd()), v_code, round(p_amount, 2), trim(p_description), coalesce(p_receipt_paths, '{}'), p_idempotency_key)
  returning id into v_id;
  select coalesce(nullif(full_name, ''), email, 'Staff') into v_name from profiles where id = public.current_user_id();
  perform public._notify_roles(array['finance_admin','super_admin']::public.app_role[], 'Expense ' || v_no || ' submitted',
    v_name || ' · ৳' || round(p_amount, 2) || ' · ' || v_cat, '/expenses/' || v_id);
  return v_id;
end $$;

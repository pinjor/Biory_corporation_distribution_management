-- ============ EXPENSES ============
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  submitted_by uuid not null references public.profiles(id),
  expense_date date not null default public.today_bd(),
  category text not null check (category in ('TRAVEL','FOOD','ACCOMMODATION','FUEL','COMMUNICATION','ENTERTAINMENT','OFFICE','OTHER')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  receipt_paths text[] not null default '{}',
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.expenses (submitted_by, created_at desc);
create index on public.expenses (status, created_at desc);
grant select on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
create policy "expenses read own or finance" on public.expenses for select to authenticated
  using (submitted_by = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]));
create trigger trg_audit_expenses after insert or update on public.expenses for each row execute function public.audit_row();

create or replace function public.submit_expense(p_date date, p_category text, p_amount numeric, p_description text,
  p_receipt_paths text[], p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; v_path text; v_name text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_idempotency_key is not null then
    select id into v_id from expenses where idempotency_key = p_idempotency_key and submitted_by = auth.uid();
    if v_id is not null then return v_id; end if;
  end if;
  if not exists (select 1 from user_roles where user_id = auth.uid()) then raise exception 'You need a role before submitting expenses'; end if;
  if p_category is null or p_category not in ('TRAVEL','FOOD','ACCOMMODATION','FUEL','COMMUNICATION','ENTERTAINMENT','OFFICE','OTHER') then raise exception 'Choose a valid category'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if trim(coalesce(p_description,'')) = '' then raise exception 'Describe what the expense was for'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Expense date cannot be in the future'; end if;
  if coalesce(array_length(p_receipt_paths, 1), 0) > 5 then raise exception 'Attach at most 5 receipts'; end if;
  if p_receipt_paths is not null then
    foreach v_path in array p_receipt_paths loop
      if v_path not like auth.uid()::text || '/%' then raise exception 'Invalid receipt attachment'; end if;
    end loop;
  end if;
  v_no := public.next_doc_no('EXP');
  insert into expenses(expense_no, submitted_by, expense_date, category, amount, description, receipt_paths, idempotency_key)
  values (v_no, auth.uid(), coalesce(p_date, public.today_bd()), p_category, round(p_amount, 2), trim(p_description), coalesce(p_receipt_paths, '{}'), p_idempotency_key)
  returning id into v_id;
  select coalesce(nullif(full_name, ''), email, 'Staff') into v_name from profiles where id = auth.uid();
  perform public._notify_roles(array['finance_admin','super_admin']::public.app_role[], 'Expense ' || v_no || ' submitted',
    v_name || ' · ৳' || round(p_amount, 2) || ' · ' || initcap(p_category), '/expenses/' || v_id);
  return v_id;
end $$;

create or replace function public.review_expense(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]) then raise exception 'Only Finance can review expenses'; end if;
  select * into e from expenses where id = p_id for update;
  if e.id is null then raise exception 'Expense not found'; end if;
  if e.status <> 'SUBMITTED' then raise exception 'This expense has already been %', lower(e.status); end if;
  if e.submitted_by = auth.uid() then raise exception 'You cannot review your own expense'; end if;
  if p_approve then
    update expenses set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note,'')), '') where id = p_id;
    perform public._notify_user(e.submitted_by, 'Expense ' || e.expense_no || ' approved', '৳' || e.amount, '/expenses/' || p_id);
  else
    if trim(coalesce(p_note,'')) = '' then raise exception 'A rejection reason is required'; end if;
    update expenses set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note) where id = p_id;
    perform public._notify_user(e.submitted_by, 'Expense ' || e.expense_no || ' rejected', trim(p_note), '/expenses/' || p_id);
  end if;
end $$;

create or replace function public.cancel_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  select * into e from expenses where id = p_id for update;
  if e.id is null or e.submitted_by is distinct from auth.uid() then raise exception 'Expense not found'; end if;
  if e.status <> 'SUBMITTED' then raise exception 'Only pending expenses can be withdrawn'; end if;
  update expenses set status = 'CANCELLED' where id = p_id;
end $$;

revoke execute on function public.submit_expense(date, text, numeric, text, text[], uuid) from public, anon;
revoke execute on function public.review_expense(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_expense(uuid) from public, anon;
grant execute on function public.submit_expense(date, text, numeric, text, text[], uuid) to authenticated;
grant execute on function public.review_expense(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_expense(uuid) to authenticated;

-- ============ RECEIPT STORAGE ============
create policy "expense receipts upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "expense receipts read own or finance" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[])));

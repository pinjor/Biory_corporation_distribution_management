-- Chemist shops are not reserved for one Sales Officer.
-- Any officer can read every shop. An admin who adds a shop does not become its officer.

create or replace function public.set_party_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.next_doc_no(case when tg_table_name = 'chemists' then 'CHM' else 'DOC' end);
  end if;
  if public.current_user_id() is not null and not public.is_admin(public.current_user_id()) then
    new.assigned_so := public.current_user_id();
  end if;
  -- A shop or doctor is not reserved for the admin who added them.
  return new;
end $$;

drop policy if exists "chemists read" on public.chemists;
create policy "chemists read" on public.chemists for select
  using (
    assigned_so = public.current_user_id()
    or created_by = public.current_user_id()
    or public.is_staff(public.current_user_id())
    or public.has_role(public.current_user_id(), 'sales_officer')
  );

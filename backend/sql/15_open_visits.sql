-- Any Sales Officer can log a visit for any doctor. The visit stores the signed-in person.

drop policy if exists "doctors read" on public.doctors;
create policy "doctors read" on public.doctors for select
  using (
    assigned_so = public.current_user_id()
    or created_by = public.current_user_id()
    or public.is_staff(public.current_user_id())
    or public.has_role(public.current_user_id(), 'sales_officer')
  );

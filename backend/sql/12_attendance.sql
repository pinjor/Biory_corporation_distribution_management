-- Sales Officer punch in / punch out. One row per officer per Dhaka day.
-- A full day is 6 hours or more. Punching out within 3 hours is a half day.
-- Days with no row are absent, and that is calculated when the report is read.
-- Safe to run again.

create table if not exists public.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  so_id uuid not null references public.profiles(id),
  work_date date not null,
  punched_in_at timestamptz not null,
  punched_out_at timestamptz,
  in_key uuid,
  out_key uuid,
  created_at timestamptz not null default now(),
  unique (so_id, work_date),
  unique (in_key),
  unique (out_key)
);

create index if not exists attendance_punches_day_idx on public.attendance_punches (work_date desc, so_id);

alter table public.attendance_punches enable row level security;

drop policy if exists "attendance read" on public.attendance_punches;
create policy "attendance read" on public.attendance_punches for select using (
  so_id = public.current_user_id()
  or public.has_any_role(public.current_user_id(), array['super_admin','admin']::public.app_role[])
);

grant select on public.attendance_punches to biory_app;

create or replace function public.punch_in(p_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.current_user_id();
  v_day date := public.today_bd();
  r public.attendance_punches;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.has_role(v_uid, 'sales_officer') then
    raise exception 'Only a Sales Officer can punch in';
  end if;
  if p_idempotency_key is not null then
    select * into r from public.attendance_punches where in_key = p_idempotency_key;
    if r.id is not null then
      return jsonb_build_object('id', r.id, 'work_date', r.work_date, 'punched_in_at', r.punched_in_at, 'punched_out_at', r.punched_out_at);
    end if;
  end if;
  select * into r from public.attendance_punches where so_id = v_uid and work_date = v_day;
  if r.id is not null then raise exception 'Already punched in today'; end if;
  begin
    insert into public.attendance_punches(so_id, work_date, punched_in_at, in_key)
    values (v_uid, v_day, clock_timestamp(), p_idempotency_key)
    returning * into r;
  exception
    when unique_violation then
      raise exception 'Already punched in today';
  end;
  return jsonb_build_object('id', r.id, 'work_date', r.work_date, 'punched_in_at', r.punched_in_at, 'punched_out_at', r.punched_out_at);
end $$;

create or replace function public.punch_out(p_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.current_user_id();
  v_day date := public.today_bd();
  r public.attendance_punches;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.has_role(v_uid, 'sales_officer') then
    raise exception 'Only a Sales Officer can punch out';
  end if;
  if p_idempotency_key is not null then
    select * into r from public.attendance_punches where out_key = p_idempotency_key;
    if r.id is not null then
      return jsonb_build_object('id', r.id, 'work_date', r.work_date, 'punched_in_at', r.punched_in_at, 'punched_out_at', r.punched_out_at);
    end if;
  end if;
  select * into r from public.attendance_punches where so_id = v_uid and work_date = v_day for update;
  if r.id is null then raise exception 'Punch in before punching out'; end if;
  if r.punched_out_at is not null then raise exception 'Already punched out today'; end if;
  update public.attendance_punches
  set punched_out_at = clock_timestamp(), out_key = p_idempotency_key
  where id = r.id
  returning * into r;
  return jsonb_build_object('id', r.id, 'work_date', r.work_date, 'punched_in_at', r.punched_in_at, 'punched_out_at', r.punched_out_at);
end $$;

grant execute on function public.punch_in(uuid) to biory_app;
grant execute on function public.punch_out(uuid) to biory_app;

insert into public.role_menus (role, menu_key)
select r.role::public.app_role, r.menu_key
from (values
  ('super_admin', '/attendance'),
  ('super_admin', '/attendance/history'),
  ('admin', '/attendance'),
  ('admin', '/attendance/history'),
  ('sales_officer', '/attendance'),
  ('sales_officer', '/attendance/history')
) as r(role, menu_key)
on conflict do nothing;

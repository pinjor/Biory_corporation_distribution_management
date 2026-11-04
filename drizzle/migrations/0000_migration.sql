
-- ============ ROLES & PROFILES ============
create type public.app_role as enum ('super_admin','admin','finance_admin','warehouse_admin','sales_officer');

create or replace function public.today_bd() returns date language sql stable as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  area text,
  zone text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  so_code text unique,
  territory_id uuid references public.territories(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin']::public.app_role[])
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin','finance_admin','warehouse_admin']::public.app_role[])
$$;

grant select, insert, update, delete on public.territories to authenticated;
grant all on public.territories to service_role;
alter table public.territories enable row level security;
create policy "territories read" on public.territories for select to authenticated using (true);
create policy "territories admin write" on public.territories for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "territories admin update" on public.territories for update to authenticated using (public.is_admin(auth.uid()));
create policy "territories admin delete" on public.territories for delete to authenticated using (public.is_admin(auth.uid()));

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "roles read own or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- ============ SETTINGS ============
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'PharmaField Ltd.',
  company_address text not null default 'Dhaka, Bangladesh',
  company_phone text,
  default_trade_discount_pct numeric(5,2) not null default 15 check (default_trade_discount_pct between 0 and 100),
  so_discount_max_pct numeric(5,2) not null default 5 check (so_discount_max_pct between 0 and 100),
  extra_discount_max_pct numeric(5,2) not null default 20 check (extra_discount_max_pct between 0 and 100),
  extra_discount_so_limit_pct numeric(5,2) not null default 5 check (extra_discount_so_limit_pct between 0 and 100),
  near_expiry_days int not null default 90 check (near_expiry_days in (30,60,90,120,180)),
  enforce_credit_limit boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings super update" on public.app_settings for update to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- ============ DOC NUMBERS ============
create table public.doc_counters (prefix text not null, yr int not null, last_no int not null default 0, primary key (prefix, yr));
grant all on public.doc_counters to service_role;
alter table public.doc_counters enable row level security;

create or replace function public.next_doc_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v_yr int := extract(year from public.today_bd()); v_no int;
begin
  insert into doc_counters(prefix, yr, last_no) values (p_prefix, v_yr, 1)
  on conflict (prefix, yr) do update set last_no = doc_counters.last_no + 1
  returning last_no into v_no;
  return p_prefix || '-' || v_yr || '-' || lpad(v_no::text, 6, '0');
end $$;

-- ============ PRODUCTS & BATCHES ============
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  generic_name text,
  strength text,
  dosage_form text,
  pack_size text,
  category text,
  kind text not null default 'saleable' check (kind in ('saleable','promotional')),
  mrp numeric(12,2) not null default 0 check (mrp >= 0),
  trade_discount_pct numeric(5,2) not null default 15 check (trade_discount_pct between 0 and 100),
  base_trp numeric(12,2) generated always as (round(mrp * (1 - trade_discount_pct / 100), 2)) stored,
  reorder_level int not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (kind, active);
grant select, insert, update on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products read" on public.products for select to authenticated using (true);
create policy "products write" on public.products for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]));
create policy "products update" on public.products for update to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]));

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  batch_no text not null,
  mfg_date date,
  expiry_date date not null,
  created_at timestamptz not null default now(),
  unique (product_id, batch_no),
  check (mfg_date is null or mfg_date < expiry_date)
);
create index on public.batches (expiry_date);
grant select on public.batches to authenticated;
grant all on public.batches to service_role;
alter table public.batches enable row level security;
create policy "batches read" on public.batches for select to authenticated using (true);

-- ============ LOCATIONS & LEDGER ============
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('central','so')),
  name text not null,
  so_id uuid unique,
  created_at timestamptz not null default now(),
  check ((kind = 'so') = (so_id is not null))
);
insert into public.locations (kind, name) values ('central', 'Central Warehouse');
grant select on public.locations to authenticated;
grant all on public.locations to service_role;
alter table public.locations enable row level security;
create policy "locations read" on public.locations for select to authenticated using (true);

create or replace function public.central_location() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.locations where kind = 'central' order by created_at limit 1
$$;
create or replace function public.so_location(_so uuid) returns uuid language sql stable security definer set search_path = public as $$
  select id from public.locations where so_id = _so
$$;
create or replace function public.can_view_location(_loc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.locations l where l.id = _loc and (l.kind = 'central' or l.so_id = auth.uid() or public.is_staff(auth.uid())))
$$;

create table public.stock_movements (
  id bigserial primary key,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  from_location uuid references public.locations(id),
  to_location uuid references public.locations(id),
  movement_type text not null check (movement_type in (
    'OPENING','PURCHASE_RECEIPT','CENTRAL_TO_SO_TRANSFER','SO_TO_CENTRAL_RETURN','SO_TO_SO_TRANSFER',
    'CUSTOMER_DELIVERY','CUSTOMER_RETURN','DOCTOR_PROMOTION','DAMAGE','EXPIRED','LOSS',
    'MANUAL_ADJUSTMENT_IN','MANUAL_ADJUSTMENT_OUT','TRANSFER_REVERSAL','DELIVERY_REVERSAL')),
  qty int not null check (qty > 0),
  reference_type text,
  reference_id uuid,
  reference_no text,
  performed_by uuid,
  performed_at timestamptz not null default now(),
  remarks text,
  check (from_location is not null or to_location is not null)
);
create index on public.stock_movements (product_id);
create index on public.stock_movements (batch_id);
create index on public.stock_movements (from_location);
create index on public.stock_movements (to_location);
create index on public.stock_movements (performed_at desc);
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "movements read" on public.stock_movements for select to authenticated
  using ((from_location is not null and public.can_view_location(from_location)) or (to_location is not null and public.can_view_location(to_location)));

create table public.stock_balances (
  location_id uuid not null references public.locations(id),
  batch_id uuid not null references public.batches(id),
  product_id uuid not null references public.products(id),
  qty int not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, batch_id)
);
create index on public.stock_balances (product_id);
grant select on public.stock_balances to authenticated;
grant all on public.stock_balances to service_role;
alter table public.stock_balances enable row level security;
create policy "balances read" on public.stock_balances for select to authenticated using (public.can_view_location(location_id));

create or replace function public.block_mutation() returns trigger language plpgsql as $$
begin raise exception 'This ledger is append-only. Use a reversal or adjustment entry.'; end $$;

create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_exp date; v_pid uuid;
begin
  select expiry_date, product_id into v_exp, v_pid from batches where id = new.batch_id;
  if v_pid <> new.product_id then raise exception 'Batch does not belong to product'; end if;
  if new.movement_type in ('CENTRAL_TO_SO_TRANSFER','SO_TO_SO_TRANSFER','CUSTOMER_DELIVERY','DOCTOR_PROMOTION')
     and v_exp <= public.today_bd() then
    raise exception 'Batch has expired and cannot be issued, transferred, delivered or promoted';
  end if;
  if new.from_location is not null then
    update stock_balances set qty = qty - new.qty, updated_at = now()
      where location_id = new.from_location and batch_id = new.batch_id and qty >= new.qty;
    if not found then raise exception 'Insufficient stock in batch for this movement'; end if;
  end if;
  if new.to_location is not null then
    insert into stock_balances(location_id, batch_id, product_id, qty) values (new.to_location, new.batch_id, new.product_id, new.qty)
    on conflict (location_id, batch_id) do update set qty = stock_balances.qty + excluded.qty, updated_at = now();
  end if;
  return new;
end $$;
create trigger trg_apply_stock after insert on public.stock_movements for each row execute function public.apply_stock_movement();
create trigger trg_block_stock_mut before update or delete on public.stock_movements for each row execute function public.block_mutation();

create or replace function public._allocate_fefo(p_location uuid, p_product uuid, p_qty int)
returns table(o_batch_id uuid, o_qty int) language plpgsql security definer set search_path = public as $$
declare r record; v_left int := p_qty; v_take int;
begin
  for r in
    select sb.batch_id as bid, sb.qty as q
    from stock_balances sb join batches b on b.id = sb.batch_id
    where sb.location_id = p_location and sb.product_id = p_product and sb.qty > 0 and b.expiry_date > public.today_bd()
    order by b.expiry_date, b.created_at
    for update of sb
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.q);
    o_batch_id := r.bid; o_qty := v_take; return next;
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then
    raise exception 'Insufficient non-expired stock for %', (select name from products where id = p_product);
  end if;
end $$;

-- ============ NOTIFICATIONS & AUDIT ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public._notify_user(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, body, link) values (p_user, p_title, p_body, p_link)
$$;
create or replace function public._notify_roles(p_roles public.app_role[], p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, body, link)
  select distinct user_id, p_title, p_body, p_link from user_roles where role = any(p_roles)
$$;

create table public.audit_log (
  id bigserial primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);
create index on public.audit_log (entity, entity_id);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin(auth.uid()));
create trigger trg_block_audit_mut before update or delete on public.audit_log for each row execute function public.block_mutation();

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if tg_op = 'DELETE' then v_id := (to_jsonb(old)->>'id'); else v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id'); end if;
  insert into audit_log(actor, action, entity, entity_id, before_data, after_data)
  values (auth.uid(), tg_op, tg_table_name, v_id,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_after jsonb, p_reason text) returns void
language sql security definer set search_path = public as $$
  insert into audit_log(actor, action, entity, entity_id, after_data, reason) values (auth.uid(), p_action, p_entity, p_entity_id, p_after, p_reason)
$$;

create trigger trg_audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger trg_audit_settings after update on public.app_settings for each row execute function public.audit_row();
create trigger trg_audit_roles after insert or delete on public.user_roles for each row execute function public.audit_row();

-- ============ NEW USER & ROLE HANDLING ============
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email);
  if not exists (select 1 from public.user_roles where role = 'super_admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create sequence public.so_code_seq;
create or replace function public.on_role_granted() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.role = 'sales_officer' then
    select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = new.user_id;
    insert into locations (kind, name, so_id) values ('so', 'SO Stock – ' || coalesce(v_name, 'SO'), new.user_id)
    on conflict (so_id) do nothing;
    update profiles set so_code = 'SO-' || lpad(nextval('public.so_code_seq')::text, 4, '0') where id = new.user_id and so_code is null;
  end if;
  return new;
end $$;
create trigger trg_role_granted after insert on public.user_roles for each row execute function public.on_role_granted();

create or replace function public.set_user_role(p_user uuid, p_role public.app_role, p_grant boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'Only Super Admin can manage roles'; end if;
  if p_grant then
    insert into user_roles(user_id, role) values (p_user, p_role) on conflict do nothing;
  else
    if p_user = auth.uid() and p_role = 'super_admin' then raise exception 'You cannot remove your own Super Admin role'; end if;
    delete from user_roles where user_id = p_user and role = p_role;
  end if;
end $$;

create or replace function public.admin_update_profile(p_user uuid, p_full_name text, p_phone text, p_territory uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  update profiles set full_name = coalesce(nullif(trim(p_full_name), ''), full_name), phone = p_phone, territory_id = p_territory, active = coalesce(p_active, active)
  where id = p_user;
  perform public._audit('UPDATE', 'profiles', p_user::text, jsonb_build_object('full_name', p_full_name, 'phone', p_phone, 'territory_id', p_territory, 'active', p_active), null);
end $$;

-- ============ CHEMISTS & DOCTORS ============
create table public.chemists (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  business_name text not null,
  owner_name text,
  mobile text,
  alternate_mobile text,
  address text,
  division text,
  district text,
  upazila text,
  territory_id uuid references public.territories(id),
  route text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  drug_license_no text,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  payment_terms_days int not null default 30 check (payment_terms_days >= 0),
  assigned_so uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index chemists_mobile_uq on public.chemists (mobile) where mobile is not null and mobile <> '';
create index on public.chemists (assigned_so);
create index on public.chemists (territory_id);

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  speciality text,
  qualification text,
  hospital text,
  chamber text,
  mobile text,
  address text,
  territory_id uuid references public.territories(id),
  latitude numeric(9,6),
  longitude numeric(9,6),
  assigned_so uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index doctors_mobile_uq on public.doctors (mobile) where mobile is not null and mobile <> '';
create index on public.doctors (assigned_so);

create or replace function public.set_party_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.next_doc_no(case when tg_table_name = 'chemists' then 'CHM' else 'DOC' end);
  end if;
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.assigned_so := auth.uid();
  end if;
  if new.assigned_so is null then new.assigned_so := auth.uid(); end if;
  return new;
end $$;
create trigger trg_chemist_code before insert on public.chemists for each row execute function public.set_party_code();
create trigger trg_doctor_code before insert on public.doctors for each row execute function public.set_party_code();
create trigger trg_audit_chemists after insert or update on public.chemists for each row execute function public.audit_row();
create trigger trg_audit_doctors after insert or update on public.doctors for each row execute function public.audit_row();

grant select, insert, update on public.chemists to authenticated;
grant all on public.chemists to service_role;
alter table public.chemists enable row level security;
create policy "chemists read" on public.chemists for select to authenticated
  using (assigned_so = auth.uid() or created_by = auth.uid() or public.is_staff(auth.uid()));
create policy "chemists insert" on public.chemists for insert to authenticated
  with check (created_by = auth.uid() and (public.has_role(auth.uid(),'sales_officer') or public.is_admin(auth.uid())));
create policy "chemists update" on public.chemists for update to authenticated
  using (assigned_so = auth.uid() or public.is_admin(auth.uid()))
  with check (assigned_so = auth.uid() or public.is_admin(auth.uid()));

grant select, insert, update on public.doctors to authenticated;
grant all on public.doctors to service_role;
alter table public.doctors enable row level security;
create policy "doctors read" on public.doctors for select to authenticated
  using (assigned_so = auth.uid() or created_by = auth.uid() or public.is_staff(auth.uid()));
create policy "doctors insert" on public.doctors for insert to authenticated
  with check (created_by = auth.uid() and (public.has_role(auth.uid(),'sales_officer') or public.is_admin(auth.uid())));
create policy "doctors update" on public.doctors for update to authenticated
  using (assigned_so = auth.uid() or public.is_admin(auth.uid()))
  with check (assigned_so = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.find_party_duplicates(p_kind text, p_name text, p_mobile text, p_place text, p_exclude uuid default null)
returns table(id uuid, code text, name text, mobile text, place text, assigned_to text, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind = 'chemist' then
    return query
      select c.id, c.code, c.business_name, c.mobile, coalesce(c.upazila, c.district, c.address), pr.full_name,
        case when nullif(p_mobile,'') is not null and c.mobile = p_mobile then 'Same mobile number' else 'Same name in same area' end
      from chemists c left join profiles pr on pr.id = c.assigned_so
      where (p_exclude is null or c.id <> p_exclude)
        and ((nullif(p_mobile,'') is not null and c.mobile = p_mobile)
          or (lower(trim(c.business_name)) = lower(trim(p_name)) and nullif(p_place,'') is not null
              and lower(coalesce(c.upazila, c.district, c.address, '')) = lower(trim(p_place))))
      limit 5;
  else
    return query
      select d.id, d.code, d.name, d.mobile, coalesce(d.chamber, d.hospital), pr.full_name,
        case when nullif(p_mobile,'') is not null and d.mobile = p_mobile then 'Same mobile number' else 'Same name at same chamber' end
      from doctors d left join profiles pr on pr.id = d.assigned_so
      where (p_exclude is null or d.id <> p_exclude)
        and ((nullif(p_mobile,'') is not null and d.mobile = p_mobile)
          or (lower(trim(d.name)) = lower(trim(p_name)) and nullif(p_place,'') is not null
              and lower(coalesce(d.chamber, d.hospital, '')) = lower(trim(p_place))))
      limit 5;
  end if;
end $$;

-- ============ STOCK OPERATIONS ============
create or replace function public.receive_stock(p_product uuid, p_batch_no text, p_mfg date, p_expiry date, p_qty int,
  p_type text default 'PURCHASE_RECEIPT', p_reference text default null, p_remarks text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_batch uuid; v_exp date;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if p_type not in ('OPENING','PURCHASE_RECEIPT') then raise exception 'Invalid receipt type'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_expiry is null then raise exception 'Expiry date is required'; end if;
  if p_expiry <= public.today_bd() then raise exception 'Cannot receive an expired batch'; end if;
  if trim(coalesce(p_batch_no,'')) = '' then raise exception 'Batch number is required'; end if;
  select id, expiry_date into v_batch, v_exp from batches where product_id = p_product and batch_no = trim(p_batch_no);
  if v_batch is null then
    insert into batches(product_id, batch_no, mfg_date, expiry_date) values (p_product, trim(p_batch_no), p_mfg, p_expiry) returning id into v_batch;
  elsif v_exp <> p_expiry then
    raise exception 'Batch % already exists with a different expiry date (%)', p_batch_no, v_exp;
  end if;
  insert into stock_movements(product_id, batch_id, to_location, movement_type, qty, reference_type, reference_no, performed_by, remarks)
  values (p_product, v_batch, public.central_location(), p_type, p_qty, 'RECEIPT', p_reference, auth.uid(), p_remarks);
  return v_batch;
end $$;

create or replace function public.import_opening_stock(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_pid uuid; v_n int := 0; v_i int := 0;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No rows to import'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    select id into v_pid from products where code = trim(r->>'product_code');
    if v_pid is null then raise exception 'Row %: unknown product code %', v_i, r->>'product_code'; end if;
    begin
      perform public.receive_stock(v_pid, r->>'batch_no', nullif(r->>'mfg_date','')::date, (r->>'expiry_date')::date,
        (r->>'qty')::int, 'OPENING', 'BULK-IMPORT', r->>'remarks');
    exception when others then
      raise exception 'Row %: %', v_i, sqlerrm;
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.adjust_stock(p_location uuid, p_batch uuid, p_qty int, p_type text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if p_type not in ('DAMAGE','EXPIRED','LOSS','MANUAL_ADJUSTMENT_OUT','MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN') then raise exception 'Invalid adjustment type'; end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A reason is required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select product_id into v_pid from batches where id = p_batch;
  if p_type in ('MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN') then
    insert into stock_movements(product_id, batch_id, to_location, movement_type, qty, reference_type, performed_by, remarks)
    values (v_pid, p_batch, p_location, p_type, p_qty, 'ADJUSTMENT', auth.uid(), p_reason);
  else
    insert into stock_movements(product_id, batch_id, from_location, movement_type, qty, reference_type, performed_by, remarks)
    values (v_pid, p_batch, p_location, p_type, p_qty, 'ADJUSTMENT', auth.uid(), p_reason);
  end if;
end $$;

create or replace function public.transfer_stock(p_from uuid, p_to uuid, p_batch uuid, p_qty int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_fk text; v_tk text; v_type text;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if p_from = p_to then raise exception 'Source and destination must differ'; end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A reason is required'; end if;
  select kind into v_fk from locations where id = p_from;
  select kind into v_tk from locations where id = p_to;
  v_type := case when v_fk = 'so' and v_tk = 'central' then 'SO_TO_CENTRAL_RETURN'
                 when v_fk = 'so' and v_tk = 'so' then 'SO_TO_SO_TRANSFER'
                 when v_fk = 'central' and v_tk = 'so' then 'CENTRAL_TO_SO_TRANSFER' end;
  if v_type is null then raise exception 'Unsupported transfer'; end if;
  select product_id into v_pid from batches where id = p_batch;
  insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, performed_by, remarks)
  values (v_pid, p_batch, p_from, p_to, v_type, p_qty, 'TRANSFER', auth.uid(), p_reason);
end $$;

-- ============ REQUISITIONS ============
create table public.requisitions (
  id uuid primary key default gen_random_uuid(),
  req_no text not null unique,
  so_id uuid not null references public.profiles(id),
  status text not null default 'SUBMITTED' check (status in ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_APPROVED','ISSUED','RECEIVED','REJECTED','CANCELLED')),
  remarks text,
  decision_note text,
  decided_by uuid, decided_at timestamptz,
  issued_by uuid, issued_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.requisitions (so_id, created_at desc);
create index on public.requisitions (status);
create table public.requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.requisitions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  requested_qty int not null check (requested_qty > 0),
  approved_qty int check (approved_qty >= 0),
  issued_qty int not null default 0 check (issued_qty >= 0),
  unique (requisition_id, product_id)
);
grant select on public.requisitions, public.requisition_items to authenticated;
grant all on public.requisitions, public.requisition_items to service_role;
alter table public.requisitions enable row level security;
alter table public.requisition_items enable row level security;
create policy "req read" on public.requisitions for select to authenticated
  using (so_id = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]));
create policy "req items read" on public.requisition_items for select to authenticated
  using (exists (select 1 from public.requisitions r where r.id = requisition_id));
create trigger trg_audit_req after insert or update on public.requisitions for each row execute function public.audit_row();

create or replace function public.submit_requisition(p_items jsonb, p_remarks text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; it jsonb;
begin
  if not public.has_role(auth.uid(), 'sales_officer') then raise exception 'Only Sales Officers can submit requisitions'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;
  v_no := public.next_doc_no('REQ');
  insert into requisitions(req_no, so_id, status, remarks) values (v_no, auth.uid(), 'SUBMITTED', p_remarks) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'qty')::int, 0) <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    insert into requisition_items(requisition_id, product_id, requested_qty) values (v_id, (it->>'product_id')::uuid, (it->>'qty')::int);
  end loop;
  perform public._notify_roles(array['warehouse_admin','super_admin']::public.app_role[], 'New requisition ' || v_no, 'Submitted by an SO and awaiting approval', '/requisitions/' || v_id);
  return v_id;
end $$;

create or replace function public.decide_requisition(p_id uuid, p_items jsonb, p_reject boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; it jsonb; v_all_full boolean := true; v_any boolean := false; ri requisition_items;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into r from requisitions where id = p_id for update;
  if r.status <> 'SUBMITTED' then raise exception 'Requisition is not awaiting a decision'; end if;
  if p_reject then
    if trim(coalesce(p_note,'')) = '' then raise exception 'A rejection reason is required'; end if;
    update requisitions set status = 'REJECTED', decision_note = p_note, decided_by = auth.uid(), decided_at = now() where id = p_id;
    update requisition_items set approved_qty = 0 where requisition_id = p_id;
    perform public._notify_user(r.so_id, 'Requisition ' || r.req_no || ' rejected', p_note, '/requisitions/' || p_id);
    return;
  end if;
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for it in select * from jsonb_array_elements(p_items) loop
      select * into ri from requisition_items where id = (it->>'item_id')::uuid and requisition_id = p_id;
      if ri.id is null then raise exception 'Unknown requisition item'; end if;
      if (it->>'approved_qty')::int < 0 or (it->>'approved_qty')::int > ri.requested_qty then raise exception 'Approved quantity must be between 0 and the requested quantity'; end if;
      update requisition_items set approved_qty = (it->>'approved_qty')::int where id = ri.id;
    end loop;
  end if;
  update requisition_items set approved_qty = requested_qty where requisition_id = p_id and approved_qty is null;
  select bool_and(approved_qty = requested_qty), bool_or(approved_qty > 0) into v_all_full, v_any from requisition_items where requisition_id = p_id;
  if not v_any then raise exception 'Approve at least one quantity, or reject the requisition'; end if;
  update requisitions set status = case when v_all_full then 'APPROVED' else 'PARTIALLY_APPROVED' end,
    decision_note = p_note, decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform public._notify_user(r.so_id, 'Requisition ' || r.req_no || ' approved', case when v_all_full then 'Fully approved' else 'Partially approved' end, '/requisitions/' || p_id);
end $$;

create or replace function public.issue_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions; ri record; a record; v_central uuid := public.central_location(); v_so_loc uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','warehouse_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into r from requisitions where id = p_id for update;
  if r.status not in ('APPROVED','PARTIALLY_APPROVED') then raise exception 'Requisition must be approved before issue'; end if;
  v_so_loc := public.so_location(r.so_id);
  if v_so_loc is null then raise exception 'SO has no stock location'; end if;
  for ri in select * from requisition_items where requisition_id = p_id and approved_qty > 0 loop
    for a in select * from public._allocate_fefo(v_central, ri.product_id, ri.approved_qty) loop
      insert into stock_movements(product_id, batch_id, from_location, to_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
      values (ri.product_id, a.o_batch_id, v_central, v_so_loc, 'CENTRAL_TO_SO_TRANSFER', a.o_qty, 'REQUISITION', p_id, r.req_no, auth.uid());
    end loop;
    update requisition_items set issued_qty = approved_qty where id = ri.id;
  end loop;
  update requisitions set status = 'ISSUED', issued_by = auth.uid(), issued_at = now() where id = p_id;
  perform public._notify_user(r.so_id, 'Stock issued for ' || r.req_no, 'Please confirm receipt', '/requisitions/' || p_id);
end $$;

create or replace function public.receive_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions;
begin
  select * into r from requisitions where id = p_id for update;
  if r.so_id <> auth.uid() then raise exception 'Only the requesting SO can confirm receipt'; end if;
  if r.status <> 'ISSUED' then raise exception 'Requisition has not been issued'; end if;
  update requisitions set status = 'RECEIVED', received_at = now() where id = p_id;
end $$;

create or replace function public.cancel_requisition(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r requisitions;
begin
  select * into r from requisitions where id = p_id for update;
  if r.so_id <> auth.uid() and not public.is_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  if r.status not in ('DRAFT','SUBMITTED') then raise exception 'Only submitted requisitions can be cancelled'; end if;
  update requisitions set status = 'CANCELLED' where id = p_id;
end $$;

-- ============ ORDERS ============
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  chemist_id uuid not null references public.chemists(id),
  so_id uuid not null references public.profiles(id),
  order_date date not null default public.today_bd(),
  status text not null default 'CONFIRMED' check (status in ('PENDING_APPROVAL','CONFIRMED','CANCELLED','CLOSED')),
  delivery_status text not null default 'NOT_DELIVERED' check (delivery_status in ('NOT_DELIVERED','PARTIALLY_DELIVERED','DELIVERED')),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID','PARTIALLY_PAID','PAID')),
  total_mrp numeric(14,2) not null default 0,
  total_base_trp numeric(14,2) not null default 0,
  so_discount_pct numeric(5,2) not null default 0,
  so_discount_amt numeric(14,2) not null default 0,
  extra_discount_pct numeric(5,2) not null default 0,
  extra_discount_amt numeric(14,2) not null default 0,
  net_total numeric(14,2) not null default 0,
  delivered_value numeric(14,2) not null default 0,
  collected_value numeric(14,2) not null default 0,
  due numeric(14,2) generated always as (delivered_value - collected_value) stored,
  first_delivered_at date,
  approval_reason text,
  approved_by uuid, approved_at timestamptz,
  cancel_reason text,
  remarks text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.orders (so_id, order_date desc);
create index on public.orders (chemist_id);
create index on public.orders (status);
create index on public.orders (payment_status);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty int not null check (qty > 0),
  delivered_qty int not null default 0 check (delivered_qty >= 0),
  mrp numeric(12,2) not null,
  trade_discount_pct numeric(5,2) not null,
  base_trp numeric(12,2) not null,
  net_unit_price numeric(14,4) not null,
  line_mrp numeric(14,2) not null,
  line_trp numeric(14,2) not null,
  line_net numeric(14,2) not null,
  unique (order_id, product_id),
  check (delivered_qty <= qty)
);
grant select on public.orders, public.order_items to authenticated;
grant all on public.orders, public.order_items to service_role;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "orders read" on public.orders for select to authenticated using (so_id = auth.uid() or public.is_staff(auth.uid()));
create policy "order items read" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create trigger trg_audit_orders after insert or update on public.orders for each row execute function public.audit_row();

create or replace function public._so_reserved(p_so uuid, p_product uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(oi.qty - oi.delivered_qty), 0)::int from order_items oi join orders o on o.id = oi.order_id
  where o.so_id = p_so and oi.product_id = p_product and o.status in ('PENDING_APPROVAL','CONFIRMED')
$$;
create or replace function public._usable_qty(p_loc uuid, p_product uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(sb.qty), 0)::int from stock_balances sb join batches b on b.id = sb.batch_id
  where sb.location_id = p_loc and sb.product_id = p_product and b.expiry_date > public.today_bd()
$$;

create or replace function public.create_order(p_chemist uuid, p_items jsonb, p_so_discount_pct numeric, p_extra_discount_pct numeric,
  p_remarks text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s app_settings; c chemists; v_id uuid; v_no text; it jsonb; p products; v_factor numeric; v_qty int;
  v_loc uuid; v_avail int; v_tot_mrp numeric := 0; v_tot_trp numeric := 0; v_net numeric := 0; v_line_trp numeric;
  v_reasons text[] := '{}'; v_outstanding numeric; v_status text; v_so_amt numeric;
begin
  if p_idempotency_key is not null then
    select id into v_id from orders where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if not public.has_role(auth.uid(), 'sales_officer') then raise exception 'Only Sales Officers can create orders'; end if;
  select * into s from app_settings where id = 1;
  select * into c from chemists where id = p_chemist;
  if c.id is null or c.status <> 'active' then raise exception 'Chemist not found or inactive'; end if;
  if c.assigned_so is distinct from auth.uid() and c.created_by is distinct from auth.uid() then raise exception 'This chemist is not assigned to you'; end if;
  p_so_discount_pct := coalesce(p_so_discount_pct, 0); p_extra_discount_pct := coalesce(p_extra_discount_pct, 0);
  if p_so_discount_pct < 0 or p_so_discount_pct > s.so_discount_max_pct then raise exception 'SO discount must be between 0 and % percent', s.so_discount_max_pct; end if;
  if p_extra_discount_pct < 0 or p_extra_discount_pct > s.extra_discount_max_pct then raise exception 'Extra discount must be between 0 and % percent', s.extra_discount_max_pct; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;
  v_factor := 1 - (p_so_discount_pct + p_extra_discount_pct) / 100;
  v_loc := public.so_location(auth.uid());
  if v_loc is null then raise exception 'You have no stock location yet'; end if;
  perform 1 from locations where id = v_loc for update;

  v_no := public.next_doc_no('ORD');
  insert into orders(order_no, chemist_id, so_id, so_discount_pct, extra_discount_pct, remarks, idempotency_key)
  values (v_no, p_chemist, auth.uid(), p_so_discount_pct, p_extra_discount_pct, p_remarks, p_idempotency_key) returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantities must be whole numbers greater than zero'; end if;
    select * into p from products where id = (it->>'product_id')::uuid;
    if p.id is null or not p.active or p.kind <> 'saleable' then raise exception 'Product is not available for sale'; end if;
    v_avail := public._usable_qty(v_loc, p.id) - public._so_reserved(auth.uid(), p.id);
    if v_qty > v_avail then raise exception '% — requested %, available %', p.name, v_qty, greatest(v_avail, 0); end if;
    v_line_trp := round(p.base_trp * v_qty, 2);
    insert into order_items(order_id, product_id, qty, mrp, trade_discount_pct, base_trp, net_unit_price, line_mrp, line_trp, line_net)
    values (v_id, p.id, v_qty, p.mrp, p.trade_discount_pct, p.base_trp, round(p.base_trp * v_factor, 4),
            round(p.mrp * v_qty, 2), v_line_trp, round(v_line_trp * v_factor, 2));
    v_tot_mrp := v_tot_mrp + round(p.mrp * v_qty, 2);
    v_tot_trp := v_tot_trp + v_line_trp;
    v_net := v_net + round(v_line_trp * v_factor, 2);
  end loop;

  if p_extra_discount_pct > s.extra_discount_so_limit_pct then
    v_reasons := v_reasons || ('Extra discount ' || p_extra_discount_pct || '% exceeds SO authority of ' || s.extra_discount_so_limit_pct || '%');
  end if;
  if s.enforce_credit_limit and c.credit_limit > 0 then
    select coalesce(sum(case when status in ('PENDING_APPROVAL','CONFIRMED') then net_total - collected_value else due end), 0)
      into v_outstanding from orders where chemist_id = p_chemist and id <> v_id and status <> 'CANCELLED';
    if v_outstanding + v_net > c.credit_limit then
      v_reasons := v_reasons || ('Credit limit ৳' || c.credit_limit || ' exceeded (exposure ৳' || round(v_outstanding + v_net, 2) || ')');
    end if;
  end if;
  v_status := case when coalesce(array_length(v_reasons, 1), 0) > 0 then 'PENDING_APPROVAL' else 'CONFIRMED' end;
  v_so_amt := round(v_tot_trp * p_so_discount_pct / 100, 2);
  update orders set total_mrp = v_tot_mrp, total_base_trp = v_tot_trp,
    so_discount_amt = v_so_amt,
    extra_discount_amt = round(v_tot_trp - v_net - v_so_amt, 2),
    net_total = v_net, status = v_status, approval_reason = nullif(array_to_string(v_reasons, '; '), '')
  where id = v_id;
  if v_status = 'PENDING_APPROVAL' then
    perform public._notify_roles(array['super_admin','admin']::public.app_role[], 'Order ' || v_no || ' needs approval', array_to_string(v_reasons, '; '), '/orders/' || v_id);
  end if;
  return v_id;
end $$;

create or replace function public.decide_order(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Only Admin or Super Admin can approve orders'; end if;
  select * into o from orders where id = p_id for update;
  if o.status <> 'PENDING_APPROVAL' then raise exception 'Order is not awaiting approval'; end if;
  if o.so_id = auth.uid() then raise exception 'You cannot approve your own order'; end if;
  if p_approve then
    update orders set status = 'CONFIRMED', approved_by = auth.uid(), approved_at = now() where id = p_id;
    perform public._notify_user(o.so_id, 'Order ' || o.order_no || ' approved', p_note, '/orders/' || p_id);
  else
    if trim(coalesce(p_note,'')) = '' then raise exception 'A rejection reason is required'; end if;
    update orders set status = 'CANCELLED', cancel_reason = 'Rejected: ' || p_note, approved_by = auth.uid(), approved_at = now() where id = p_id;
    perform public._notify_user(o.so_id, 'Order ' || o.order_no || ' rejected', p_note, '/orders/' || p_id);
  end if;
end $$;

create or replace function public.cancel_order(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_id for update;
  if o.so_id <> auth.uid() and not public.is_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  if o.status not in ('PENDING_APPROVAL','CONFIRMED') or o.delivery_status <> 'NOT_DELIVERED' then raise exception 'Only undelivered orders can be cancelled'; end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A cancellation reason is required'; end if;
  update orders set status = 'CANCELLED', cancel_reason = p_reason where id = p_id;
end $$;

create or replace function public._refresh_order_status(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_full boolean; v_any boolean; o orders;
begin
  select bool_and(delivered_qty = qty), bool_or(delivered_qty > 0) into v_full, v_any from order_items where order_id = p_id;
  update orders set delivery_status = case when v_full then 'DELIVERED' when v_any then 'PARTIALLY_DELIVERED' else 'NOT_DELIVERED' end where id = p_id;
  select * into o from orders where id = p_id;
  update orders set
    payment_status = case when o.collected_value <= 0 then 'UNPAID'
                          when o.delivery_status = 'DELIVERED' and o.collected_value >= o.delivered_value then 'PAID'
                          else 'PARTIALLY_PAID' end,
    status = case when o.status = 'CONFIRMED' and o.delivery_status = 'DELIVERED' and o.collected_value >= o.delivered_value then 'CLOSED'
                  when o.status = 'CLOSED' and (o.delivery_status <> 'DELIVERED' or o.collected_value < o.delivered_value) then 'CONFIRMED'
                  else o.status end
  where id = p_id;
end $$;

-- ============ DELIVERIES ============
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_no text not null unique,
  order_id uuid not null references public.orders(id),
  so_id uuid not null references public.profiles(id),
  chemist_id uuid not null references public.chemists(id),
  delivery_date date not null default public.today_bd(),
  delivery_type text not null check (delivery_type in ('FULL','PARTIAL')),
  total_value numeric(14,2) not null default 0,
  remarks text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.deliveries (order_id);
create index on public.deliveries (so_id, delivery_date desc);
create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id),
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  qty int not null check (qty > 0),
  mrp numeric(12,2) not null,
  net_unit_price numeric(14,4) not null,
  line_value numeric(14,2) not null
);
grant select on public.deliveries, public.delivery_items to authenticated;
grant all on public.deliveries, public.delivery_items to service_role;
alter table public.deliveries enable row level security;
alter table public.delivery_items enable row level security;
create policy "deliveries read" on public.deliveries for select to authenticated using (so_id = auth.uid() or public.is_staff(auth.uid()));
create policy "delivery items read" on public.delivery_items for select to authenticated using (exists (select 1 from public.deliveries d where d.id = delivery_id));

create or replace function public.deliver_order(p_order uuid, p_items jsonb, p_remarks text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orders; v_id uuid; v_no text; it jsonb; oi order_items; a record; v_qty int; v_total numeric := 0; v_val numeric;
  v_loc uuid; v_full boolean := true; v_count int := 0;
begin
  if p_idempotency_key is not null then
    select id into v_id from deliveries where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.so_id <> auth.uid() then raise exception 'Only the order''s SO can deliver from their stock'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'Order must be confirmed before delivery (current: %)', o.status; end if;
  v_loc := public.so_location(o.so_id);
  perform 1 from locations where id = v_loc for update;
  v_no := public.next_doc_no('DLV');
  insert into deliveries(delivery_no, order_id, so_id, chemist_id, delivery_type, remarks, idempotency_key)
  values (v_no, o.id, o.so_id, o.chemist_id, 'PARTIAL', p_remarks, p_idempotency_key) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((it->>'qty')::int, 0);
    if v_qty < 0 then raise exception 'Quantities cannot be negative'; end if;
    continue when v_qty = 0;
    select * into oi from order_items where id = (it->>'order_item_id')::uuid and order_id = o.id for update;
    if oi.id is null then raise exception 'Unknown order line'; end if;
    if v_qty > oi.qty - oi.delivered_qty then raise exception 'Cannot deliver more than the remaining quantity'; end if;
    for a in select * from public._allocate_fefo(v_loc, oi.product_id, v_qty) loop
      v_val := round(a.o_qty * oi.net_unit_price, 2);
      insert into delivery_items(delivery_id, order_item_id, product_id, batch_id, qty, mrp, net_unit_price, line_value)
      values (v_id, oi.id, oi.product_id, a.o_batch_id, a.o_qty, oi.mrp, oi.net_unit_price, v_val);
      insert into stock_movements(product_id, batch_id, from_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
      values (oi.product_id, a.o_batch_id, v_loc, 'CUSTOMER_DELIVERY', a.o_qty, 'DELIVERY', v_id, v_no, auth.uid());
      v_total := v_total + v_val;
    end loop;
    update order_items set delivered_qty = delivered_qty + v_qty where id = oi.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Enter a quantity for at least one product'; end if;
  select bool_and(delivered_qty = qty) into v_full from order_items where order_id = o.id;
  if v_full and o.delivery_status = 'NOT_DELIVERED' then update deliveries set delivery_type = 'FULL' where id = v_id; end if;
  if v_full then
    v_val := o.net_total - (o.delivered_value + v_total);
    if abs(v_val) <= 1 and v_val <> 0 then
      update delivery_items set line_value = line_value + v_val
        where id = (select id from delivery_items where delivery_id = v_id order by line_value desc limit 1);
      v_total := v_total + v_val;
    end if;
  end if;
  update deliveries set total_value = v_total where id = v_id;
  update orders set delivered_value = delivered_value + v_total, first_delivered_at = coalesce(first_delivered_at, public.today_bd()) where id = o.id;
  perform public._refresh_order_status(o.id);
  return v_id;
end $$;

-- ============ WALLET & COLLECTIONS ============
create table public.wallet_ledger (
  id bigserial primary key,
  so_id uuid not null references public.profiles(id),
  entry_type text not null check (entry_type in ('CUSTOMER_COLLECTION','COLLECTION_REVERSAL','DEPOSIT_SUBMITTED','DEPOSIT_REVERSAL','ADJUSTMENT')),
  amount numeric(14,2) not null check (amount <> 0),
  reference_type text,
  reference_id uuid,
  reference_no text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.wallet_ledger (so_id, created_at desc);
grant select on public.wallet_ledger to authenticated;
grant all on public.wallet_ledger to service_role;
alter table public.wallet_ledger enable row level security;
create policy "wallet read" on public.wallet_ledger for select to authenticated
  using (so_id = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]));
create trigger trg_block_wallet_mut before update or delete on public.wallet_ledger for each row execute function public.block_mutation();

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  collection_no text not null unique,
  order_id uuid not null references public.orders(id),
  chemist_id uuid not null references public.chemists(id),
  so_id uuid not null references public.profiles(id),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('CASH','BANK','MFS','CHEQUE','OTHER')),
  reference text,
  collection_date date not null default public.today_bd(),
  remarks text,
  status text not null default 'VALID' check (status in ('VALID','REVERSED')),
  reversed_by uuid, reversed_at timestamptz, reversal_reason text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.collections (so_id, collection_date desc);
create index on public.collections (order_id);
grant select on public.collections to authenticated;
grant all on public.collections to service_role;
alter table public.collections enable row level security;
create policy "collections read" on public.collections for select to authenticated using (so_id = auth.uid() or public.is_staff(auth.uid()));
create trigger trg_audit_collections after insert or update on public.collections for each row execute function public.audit_row();

create or replace function public.record_collection(p_order uuid, p_amount numeric, p_method text, p_reference text, p_date date,
  p_remarks text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orders; v_id uuid; v_no text;
begin
  if p_idempotency_key is not null then
    select id into v_id from collections where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.so_id <> auth.uid() then raise exception 'Only the order''s SO can record collections'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  p_amount := round(p_amount, 2);
  if p_amount > o.delivered_value - o.collected_value then raise exception 'Amount exceeds the outstanding due of ৳%', o.delivered_value - o.collected_value; end if;
  if p_method not in ('CASH','BANK','MFS','CHEQUE','OTHER') then raise exception 'Invalid payment method'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Collection date cannot be in the future'; end if;
  v_no := public.next_doc_no('COL');
  insert into collections(collection_no, order_id, chemist_id, so_id, amount, method, reference, collection_date, remarks, idempotency_key)
  values (v_no, o.id, o.chemist_id, o.so_id, p_amount, p_method, p_reference, coalesce(p_date, public.today_bd()), p_remarks, p_idempotency_key)
  returning id into v_id;
  insert into wallet_ledger(so_id, entry_type, amount, reference_type, reference_id, reference_no, created_by, note)
  values (o.so_id, 'CUSTOMER_COLLECTION', p_amount, 'COLLECTION', v_id, v_no, auth.uid(), 'Collected against ' || o.order_no);
  update orders set collected_value = collected_value + p_amount where id = o.id;
  perform public._refresh_order_status(o.id);
  return v_id;
end $$;

create or replace function public.reverse_collection(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c collections;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'A reason is required'; end if;
  select * into c from collections where id = p_id for update;
  if c.status <> 'VALID' then raise exception 'Collection already reversed'; end if;
  update collections set status = 'REVERSED', reversed_by = auth.uid(), reversed_at = now(), reversal_reason = p_reason where id = p_id;
  insert into wallet_ledger(so_id, entry_type, amount, reference_type, reference_id, reference_no, created_by, note)
  values (c.so_id, 'COLLECTION_REVERSAL', -c.amount, 'COLLECTION', c.id, c.collection_no, auth.uid(), p_reason);
  perform 1 from orders where id = c.order_id for update;
  update orders set collected_value = collected_value - c.amount where id = c.order_id;
  perform public._refresh_order_status(c.order_id);
end $$;

-- ============ DEPOSITS ============
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  deposit_no text not null unique,
  so_id uuid not null references public.profiles(id),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('CASH','BANK','MFS')),
  provider text,
  account_ref text,
  transaction_id text,
  deposit_date date not null default public.today_bd(),
  received_by text,
  remarks text,
  attachment_path text,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','APPROVED','REJECTED')),
  reviewed_by uuid, reviewed_at timestamptz,
  rejection_reason text,
  receipt_no text unique,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.deposits (so_id, created_at desc);
create index on public.deposits (status);
grant select on public.deposits to authenticated;
grant all on public.deposits to service_role;
alter table public.deposits enable row level security;
create policy "deposits read" on public.deposits for select to authenticated
  using (so_id = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]));
create trigger trg_audit_deposits after insert or update on public.deposits for each row execute function public.audit_row();

create or replace function public.wallet_balance(p_so uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from wallet_ledger where so_id = p_so
    and (p_so = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]))
$$;

create or replace function public.submit_deposit(p_amount numeric, p_method text, p_provider text, p_account_ref text, p_transaction_id text,
  p_date date, p_received_by text, p_remarks text, p_attachment_path text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; v_bal numeric;
begin
  if p_idempotency_key is not null then
    select id into v_id from deposits where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if not public.has_role(auth.uid(), 'sales_officer') then raise exception 'Only Sales Officers can submit deposits'; end if;
  perform 1 from profiles where id = auth.uid() for update;
  v_bal := public.wallet_balance(auth.uid());
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  p_amount := round(p_amount, 2);
  if p_amount > v_bal then raise exception 'Amount exceeds your wallet balance of ৳%', v_bal; end if;
  if p_method not in ('CASH','BANK','MFS') then raise exception 'Invalid method'; end if;
  if p_method in ('BANK','MFS') and trim(coalesce(p_transaction_id,'')) = '' then raise exception 'Transaction ID is required for bank/MFS deposits'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Deposit date cannot be in the future'; end if;
  if p_attachment_path is not null and p_attachment_path not like auth.uid()::text || '/%' then raise exception 'Invalid attachment'; end if;
  v_no := public.next_doc_no('DEP');
  insert into deposits(deposit_no, so_id, amount, method, provider, account_ref, transaction_id, deposit_date, received_by, remarks, attachment_path, idempotency_key)
  values (v_no, auth.uid(), p_amount, p_method, p_provider, p_account_ref, p_transaction_id, coalesce(p_date, public.today_bd()), p_received_by, p_remarks, p_attachment_path, p_idempotency_key)
  returning id into v_id;
  insert into wallet_ledger(so_id, entry_type, amount, reference_type, reference_id, reference_no, created_by, note)
  values (auth.uid(), 'DEPOSIT_SUBMITTED', -p_amount, 'DEPOSIT', v_id, v_no, auth.uid(), 'Submitted to company');
  perform public._notify_roles(array['finance_admin','super_admin']::public.app_role[], 'Deposit ' || v_no || ' submitted', '৳' || p_amount || ' via ' || p_method, '/deposits/' || v_id);
  return v_id;
end $$;

create or replace function public.review_deposit(p_id uuid, p_approve boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d deposits;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into d from deposits where id = p_id for update;
  if d.status <> 'SUBMITTED' then raise exception 'Deposit already reviewed'; end if;
  if d.so_id = auth.uid() then raise exception 'You cannot review your own deposit'; end if;
  if p_approve then
    update deposits set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(), receipt_no = public.next_doc_no('RCPT') where id = p_id;
    perform public._notify_user(d.so_id, 'Deposit ' || d.deposit_no || ' approved', 'Receipt is ready', '/deposits/' || p_id);
  else
    if trim(coalesce(p_reason,'')) = '' then raise exception 'A rejection reason is required'; end if;
    update deposits set status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason where id = p_id;
    insert into wallet_ledger(so_id, entry_type, amount, reference_type, reference_id, reference_no, created_by, note)
    values (d.so_id, 'DEPOSIT_REVERSAL', d.amount, 'DEPOSIT', d.id, d.deposit_no, auth.uid(), 'Rejected: ' || p_reason);
    perform public._notify_user(d.so_id, 'Deposit ' || d.deposit_no || ' rejected', p_reason, '/deposits/' || p_id);
  end if;
end $$;

-- ============ DOCTOR VISITS ============
create table public.doctor_visits (
  id uuid primary key default gen_random_uuid(),
  visit_no text not null unique,
  doctor_id uuid not null references public.doctors(id),
  so_id uuid not null references public.profiles(id),
  visit_date date not null default public.today_bd(),
  start_time time,
  end_time time,
  latitude numeric(9,6),
  longitude numeric(9,6),
  purpose text,
  notes text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.doctor_visits (so_id, visit_date desc);
create index on public.doctor_visits (doctor_id);
create table public.visit_items (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.doctor_visits(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  qty int not null check (qty > 0)
);
grant select on public.doctor_visits, public.visit_items to authenticated;
grant all on public.doctor_visits, public.visit_items to service_role;
alter table public.doctor_visits enable row level security;
alter table public.visit_items enable row level security;
create policy "visits read" on public.doctor_visits for select to authenticated using (so_id = auth.uid() or public.is_staff(auth.uid()));
create policy "visit items read" on public.visit_items for select to authenticated using (exists (select 1 from public.doctor_visits v where v.id = visit_id));

create or replace function public.record_doctor_visit(p_doctor uuid, p_date date, p_start time, p_end time, p_lat numeric, p_lng numeric,
  p_purpose text, p_notes text, p_items jsonb, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d doctors; v_id uuid; v_no text; it jsonb; a record; v_loc uuid; p products; v_qty int;
begin
  if p_idempotency_key is not null then
    select id into v_id from doctor_visits where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if not public.has_role(auth.uid(), 'sales_officer') then raise exception 'Only Sales Officers can record visits'; end if;
  select * into d from doctors where id = p_doctor;
  if d.id is null or d.status <> 'active' then raise exception 'Doctor not found or inactive'; end if;
  if d.assigned_so is distinct from auth.uid() and d.created_by is distinct from auth.uid() then raise exception 'This doctor is not assigned to you'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'End time must be after start time'; end if;
  if p_date is not null and p_date > public.today_bd() then raise exception 'Visit date cannot be in the future'; end if;
  v_loc := public.so_location(auth.uid());
  perform 1 from locations where id = v_loc for update;
  v_no := public.next_doc_no('VIS');
  insert into doctor_visits(visit_no, doctor_id, so_id, visit_date, start_time, end_time, latitude, longitude, purpose, notes, idempotency_key)
  values (v_no, p_doctor, auth.uid(), coalesce(p_date, public.today_bd()), p_start, p_end, p_lat, p_lng, p_purpose, p_notes, p_idempotency_key)
  returning id into v_id;
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for it in select * from jsonb_array_elements(p_items) loop
      v_qty := coalesce((it->>'qty')::int, 0);
      if v_qty < 0 then raise exception 'Quantities cannot be negative'; end if;
      continue when v_qty = 0;
      select * into p from products where id = (it->>'product_id')::uuid;
      if p.id is null or p.kind <> 'promotional' then raise exception 'Only promotional products can be given on visits'; end if;
      for a in select * from public._allocate_fefo(v_loc, p.id, v_qty) loop
        insert into visit_items(visit_id, product_id, batch_id, qty) values (v_id, p.id, a.o_batch_id, a.o_qty);
        insert into stock_movements(product_id, batch_id, from_location, movement_type, qty, reference_type, reference_id, reference_no, performed_by)
        values (p.id, a.o_batch_id, v_loc, 'DOCTOR_PROMOTION', a.o_qty, 'VISIT', v_id, v_no, auth.uid());
      end loop;
    end loop;
  end if;
  return v_id;
end $$;

-- ============ VIEWS ============
create view public.v_stock with (security_invoker = on) as
select sb.location_id, l.kind as location_kind, l.name as location_name, l.so_id,
  sb.batch_id, b.batch_no, b.mfg_date, b.expiry_date, (b.expiry_date - public.today_bd()) as days_to_expiry,
  sb.product_id, p.code as product_code, p.name as product_name, p.kind as product_kind, p.mrp, p.base_trp, p.reorder_level,
  sb.qty, round(sb.qty * p.base_trp, 2) as value_trp
from public.stock_balances sb
join public.locations l on l.id = sb.location_id
join public.batches b on b.id = sb.batch_id
join public.products p on p.id = sb.product_id;
grant select on public.v_stock to authenticated;

create view public.v_wallet_summary with (security_invoker = on) as
select p.id as so_id, p.full_name, p.so_code,
  coalesce((select sum(amount) from public.wallet_ledger w where w.so_id = p.id), 0) as balance,
  coalesce((select sum(amount) from public.deposits d where d.so_id = p.id and d.status = 'SUBMITTED'), 0) as pending,
  coalesce((select sum(amount) from public.deposits d where d.so_id = p.id and d.status = 'APPROVED'), 0) as settled,
  coalesce((select sum(amount) from public.collections c where c.so_id = p.id and c.status = 'VALID'), 0) as total_collected
from public.profiles p
where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'sales_officer')
  and (p.id = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[]));
grant select on public.v_wallet_summary to authenticated;

create or replace function public.my_available_stock()
returns table(product_id uuid, on_hand int, reserved int, available int)
language sql stable security definer set search_path = public as $$
  with loc as (select public.so_location(auth.uid()) as id),
  oh as (
    select sb.product_id as pid, sum(sb.qty)::int as q from stock_balances sb join batches b on b.id = sb.batch_id
    join loc on sb.location_id = loc.id
    where b.expiry_date > public.today_bd() group by sb.product_id
  )
  select oh.pid, oh.q, public._so_reserved(auth.uid(), oh.pid), oh.q - public._so_reserved(auth.uid(), oh.pid)
  from oh
$$;

-- ============ DASHBOARD ============
create or replace function public.dashboard_summary(p_from date, p_to date, p_so uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_so uuid := p_so; v_staff boolean := public.is_staff(auth.uid()); v_near int; r jsonb; v_loc_filter uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not v_staff then v_so := auth.uid(); end if;
  select near_expiry_days into v_near from app_settings where id = 1;
  v_loc_filter := case when v_so is not null then public.so_location(v_so) end;
  select jsonb_build_object(
    'orders_count', (select count(*) from orders where status <> 'CANCELLED' and order_date between p_from and p_to and (v_so is null or so_id = v_so)),
    'order_value', (select coalesce(sum(net_total),0) from orders where status <> 'CANCELLED' and order_date between p_from and p_to and (v_so is null or so_id = v_so)),
    'delivered_value', (select coalesce(sum(total_value),0) from deliveries where delivery_date between p_from and p_to and (v_so is null or so_id = v_so)),
    'collected_value', (select coalesce(sum(amount),0) from collections where status = 'VALID' and collection_date between p_from and p_to and (v_so is null or so_id = v_so)),
    'outstanding_due', (select coalesce(sum(due),0) from orders where status <> 'CANCELLED' and (v_so is null or so_id = v_so)),
    'overdue_due', (select coalesce(sum(o.due),0) from orders o join chemists c on c.id = o.chemist_id where o.status <> 'CANCELLED' and o.due > 0 and o.first_delivered_at + c.payment_terms_days < public.today_bd() and (v_so is null or o.so_id = v_so)),
    'wallet_balance', (select coalesce(sum(amount),0) from wallet_ledger where (v_so is null or so_id = v_so)),
    'pending_deposits_count', (select count(*) from deposits where status = 'SUBMITTED' and (v_so is null or so_id = v_so)),
    'pending_deposits_value', (select coalesce(sum(amount),0) from deposits where status = 'SUBMITTED' and (v_so is null or so_id = v_so)),
    'visits_count', (select count(*) from doctor_visits where visit_date between p_from and p_to and (v_so is null or so_id = v_so)),
    'new_chemists', (select count(*) from chemists where (created_at at time zone 'Asia/Dhaka')::date between p_from and p_to and (v_so is null or assigned_so = v_so)),
    'pending_order_approvals', (select count(*) from orders where status = 'PENDING_APPROVAL' and (v_so is null or so_id = v_so)),
    'pending_requisitions', (select count(*) from requisitions where status = 'SUBMITTED' and (v_so is null or so_id = v_so)),
    'awaiting_issue', (select count(*) from requisitions where status in ('APPROVED','PARTIALLY_APPROVED') and (v_so is null or so_id = v_so)),
    'near_expiry_batches', (select count(*) from stock_balances sb join batches b on b.id = sb.batch_id where sb.qty > 0 and b.expiry_date > public.today_bd() and b.expiry_date <= public.today_bd() + v_near and (v_loc_filter is null or sb.location_id = v_loc_filter)),
    'expired_batches', (select count(*) from stock_balances sb join batches b on b.id = sb.batch_id where sb.qty > 0 and b.expiry_date <= public.today_bd() and (v_loc_filter is null or sb.location_id = v_loc_filter)),
    'low_stock_products', (select count(*) from products p where p.active and p.reorder_level > 0 and
        coalesce((select sum(sb.qty) from stock_balances sb join batches b on b.id = sb.batch_id where sb.product_id = p.id and sb.location_id = public.central_location() and b.expiry_date > public.today_bd()),0) < p.reorder_level),
    'top_sos', case when v_staff and v_so is null then (
      select coalesce(jsonb_agg(t order by t.collected desc, t.order_value desc), '[]'::jsonb) from (
        select pr.id, pr.full_name, pr.so_code,
          (select coalesce(sum(net_total),0) from orders o where o.so_id = pr.id and o.status <> 'CANCELLED' and o.order_date between p_from and p_to) as order_value,
          (select coalesce(sum(total_value),0) from deliveries d where d.so_id = pr.id and d.delivery_date between p_from and p_to) as delivered,
          (select coalesce(sum(amount),0) from collections c where c.so_id = pr.id and c.status = 'VALID' and c.collection_date between p_from and p_to) as collected,
          (select count(*) from doctor_visits v where v.so_id = pr.id and v.visit_date between p_from and p_to) as visits,
          (select count(*) from chemists ch where ch.assigned_so = pr.id and (ch.created_at at time zone 'Asia/Dhaka')::date between p_from and p_to) as new_chemists
        from profiles pr where exists (select 1 from user_roles ur where ur.user_id = pr.id and ur.role = 'sales_officer')
        limit 50) t) else '[]'::jsonb end
  ) into r;
  return r;
end $$;

-- ============ STORAGE POLICIES ============
create policy "deposit proofs upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'deposit-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deposit proofs read own or finance" on storage.objects for select to authenticated
  using (bucket_id = 'deposit-proofs' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(auth.uid(), array['super_admin','admin','finance_admin']::public.app_role[])));

-- ============ FUNCTION PRIVILEGES ============
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.next_doc_no(text) from authenticated;
revoke execute on function public._allocate_fefo(uuid, uuid, int) from authenticated;
revoke execute on function public._notify_user(uuid, text, text, text) from authenticated;
revoke execute on function public._notify_roles(public.app_role[], text, text, text) from authenticated;
revoke execute on function public._audit(text, text, text, jsonb, text) from authenticated;
revoke execute on function public._refresh_order_status(uuid) from authenticated;
revoke execute on function public._so_reserved(uuid, uuid) from authenticated;
revoke execute on function public._usable_qty(uuid, uuid) from authenticated;

-- ============ DEMO MASTER DATA ============
insert into public.territories (name, area, zone) values
  ('Dhanmondi', 'Dhaka South', 'Dhaka'), ('Mirpur', 'Dhaka North', 'Dhaka'), ('Uttara', 'Dhaka North', 'Dhaka'), ('Agrabad', 'Chattogram City', 'Chattogram');

insert into public.products (code, name, generic_name, strength, dosage_form, pack_size, category, kind, mrp, trade_discount_pct, reorder_level) values
  ('NAP500', 'Napa 500', 'Paracetamol', '500 mg', 'Tablet', '10x10', 'Analgesic', 'saleable', 100, 15, 200),
  ('SEC20', 'Seclo 20', 'Omeprazole', '20 mg', 'Capsule', '6x10', 'Gastro', 'saleable', 300, 15, 100),
  ('MON10', 'Monas 10', 'Montelukast', '10 mg', 'Tablet', '3x10', 'Respiratory', 'saleable', 480, 15, 60),
  ('AZI500', 'Azithrocin 500', 'Azithromycin', '500 mg', 'Tablet', '1x6', 'Antibiotic', 'saleable', 210, 15, 80),
  ('FEX120', 'Fexo 120', 'Fexofenadine', '120 mg', 'Tablet', '5x10', 'Antihistamine', 'saleable', 450, 15, 60),
  ('ORS01', 'Orsaline-N', 'Oral Rehydration Salt', '10.25 g', 'Sachet', '20 sachets', 'Electrolyte', 'saleable', 120, 15, 150),
  ('PRM-PAD', 'Branded Prescription Pad', null, null, 'Stationery', '1 pad', 'Promotional', 'promotional', 0, 0, 50),
  ('PRM-PEN', 'Branded Pen', null, null, 'Stationery', '1 pc', 'Promotional', 'promotional', 0, 0, 100),
  ('SMP-SEC', 'Seclo 20 Physician Sample', 'Omeprazole', '20 mg', 'Capsule', '1x4', 'Sample', 'promotional', 0, 0, 100);

do $$
declare v_central uuid := public.central_location(); r record; v_b uuid;
begin
  for r in select * from (values
    ('NAP500','NP2601', date '2026-01-10', date '2028-01-09', 800),
    ('NAP500','NP2512', date '2025-12-01', date '2027-02-28', 300),
    ('SEC20','SC2603', date '2026-03-05', date '2028-03-04', 400),
    ('MON10','MN2602', date '2026-02-14', date '2027-02-13', 150),
    ('AZI500','AZ2511', date '2025-11-20', date '2026-12-31', 120),
    ('FEX120','FX2604', date '2026-04-01', date '2028-03-31', 250),
    ('ORS01','OR2605', date '2026-05-01', date '2027-10-31', 600),
    ('PRM-PAD','PD2601', date '2026-01-01', date '2030-12-31', 500),
    ('PRM-PEN','PN2601', date '2026-01-01', date '2030-12-31', 1000),
    ('SMP-SEC','SS2604', date '2026-04-01', date '2027-03-31', 300)
  ) as t(code, bno, mfg, exp, qty) loop
    insert into public.batches(product_id, batch_no, mfg_date, expiry_date)
      select id, r.bno, r.mfg, r.exp from public.products where code = r.code returning id into v_b;
    insert into public.stock_movements(product_id, batch_id, to_location, movement_type, qty, reference_type, reference_no, remarks)
      select product_id, v_b, v_central, 'OPENING', r.qty, 'RECEIPT', 'OPENING-SEED', 'Initial opening stock' from public.batches where id = v_b;
  end loop;
end $$;

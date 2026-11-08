-- Top up every list to at least 10 rows. Safe to run again.
-- Sample sales officers sign in with Officer@2026.

begin;

select set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
select set_config(
  'seed.pw_hash',
  '$argon2id$v=19$m=65536,t=3,p=4$rUBSBp6jSI0yGC2aS/UOJg$/ZlUv/rwoEEP9kjN/XmnI2QF4AhoUfMGO3ci9z/y+6s',
  true
);

insert into public.territories (name, area, zone)
select format('Sample territory %s', n), 'Dhaka', 'Dhaka'
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.territories))) as g(n)
where not exists (
  select 1 from public.territories t where t.name = format('Sample territory %s', n)
);

insert into public.master_values (kind, name)
select 'pack_size', format('Sample pack %s', n)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.master_values where kind = 'pack_size'))) as g(n)
where not exists (
  select 1 from public.master_values m where m.kind = 'pack_size' and m.name = format('Sample pack %s', n)
);

insert into public.master_values (kind, name, code)
select 'expense_category', format('Sample expense %s', n), format('SAMP%s', n)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.master_values where kind = 'expense_category'))) as g(n)
where not exists (
  select 1 from public.master_values m where m.kind = 'expense_category' and m.name = format('Sample expense %s', n)
);

insert into public.master_values (kind, name)
select 'uom', format('Sample UOM %s', n)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.master_values where kind = 'uom'))) as g(n)
where not exists (
  select 1 from public.master_values m where m.kind = 'uom' and m.name = format('Sample UOM %s', n)
);

insert into public.master_values (kind, name)
select 'strength', format('%s mg', n * 50)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.master_values where kind = 'strength'))) as g(n)
where not exists (
  select 1 from public.master_values m where m.kind = 'strength' and m.name = format('%s mg', n * 50)
);

insert into public.master_values (kind, name)
select 'generic_name', format('Sample generic %s', n)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.master_values where kind = 'generic_name'))) as g(n)
where not exists (
  select 1 from public.master_values m where m.kind = 'generic_name' and m.name = format('Sample generic %s', n)
);

insert into public.products (code, name, generic_name, strength, dosage_form, pack_size, uom, category, kind, mrp, trade_discount_pct, reorder_level)
select
  'SMP' || lpad(n::text, 2, '0'),
  format('Sample Tablet %s', n),
  format('Sample generic %s', n),
  format('%s mg', n * 50),
  'Tablet',
  '10s',
  'Strip',
  'Sample',
  'saleable',
  80 + n * 15,
  15,
  20
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.products))) as g(n)
where not exists (select 1 from public.products p where p.code = 'SMP' || lpad(n::text, 2, '0'));

insert into public.chemists (
  business_name, owner_name, mobile, address, division, district, upazila, territory_id, assigned_so, credit_limit, payment_terms_days
)
select
  format('Sample Pharmacy %s', n),
  format('Owner %s', n),
  '01755' || lpad(n::text, 6, '0'),
  format('Shop %s, Dhaka', n),
  'Dhaka',
  'Dhaka',
  'Dhanmondi',
  (select id from public.territories order by name limit 1),
  (select id from public.users where email = 'so@biory.local'),
  50000,
  30
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.chemists))) as g(n)
where not exists (select 1 from public.chemists c where c.business_name = format('Sample Pharmacy %s', n));

insert into public.doctors (
  name, speciality, qualification, hospital, chamber, mobile, address, territory_id, assigned_so
)
select
  format('Dr Sample %s', n),
  'Medicine',
  'MBBS',
  format('Sample Hospital %s', n),
  format('Chamber %s', n),
  '01855' || lpad(n::text, 6, '0'),
  'Dhaka',
  (select id from public.territories order by name limit 1),
  (select id from public.users where email = 'so@biory.local')
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.doctors))) as g(n)
where not exists (select 1 from public.doctors d where d.name = format('Dr Sample %s', n));

do $$
declare
  i int;
  n int;
  tid uuid;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  select id into tid from public.territories order by name limit 1;
  select count(*) into n from public.user_roles where role = 'sales_officer';
  for i in 1..greatest(0, 10 - n) loop
    perform public.create_sales_officer(
      format('officer%s@biory.local', lpad((n + i)::text, 2, '0')),
      current_setting('seed.pw_hash'),
      'Officer@2026',
      format('Sample Officer %s', n + i),
      format('0161000%04s', n + i),
      tid
    );
  end loop;
end $$;

do $$
declare
  prod record;
  n int := 0;
  guard int := 0;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  while (select count(*) from public.stock_movements where movement_type = 'OPENING') < 10 loop
    guard := guard + 1;
    if guard > 40 then raise exception 'Could not post 10 opening rows'; end if;
    select id, code into prod
    from public.products
    where active
    order by code
    offset ((guard - 1) % greatest((select count(*) from public.products), 1))
    limit 1;
    perform public.receive_stock(
      prod.id,
      format('SMPB-%s', lpad(guard::text, 2, '0')),
      date '2026-01-01',
      date '2028-12-31',
      400,
      'OPENING',
      'SAMPLE',
      'Sample opening balance'
    );
    n := n + 1;
  end loop;
end $$;

do $$
declare
  loc uuid;
  batch uuid;
  kinds text[] := array['DAMAGE','LOSS','MANUAL_ADJUSTMENT_OUT','MANUAL_ADJUSTMENT_IN','CUSTOMER_RETURN'];
  i int := 0;
  guard int := 0;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  loc := public.central_location();
  while (select count(*) from public.stock_movements where movement_type = any(kinds)) < 10 loop
    guard := guard + 1;
    if guard > 30 then raise exception 'Could not post 10 adjustments'; end if;
    select sb.batch_id into batch
    from public.stock_balances sb
    where sb.location_id = loc and sb.qty >= 5
    order by sb.batch_id
    offset ((guard - 1) % 10)
    limit 1;
    if batch is null then raise exception 'No central stock to adjust'; end if;
    perform public.adjust_stock(loc, batch, 1, kinds[1 + (i % array_length(kinds, 1))], format('Sample adjustment %s', guard));
    i := i + 1;
  end loop;
end $$;

do $$
declare
  so uuid;
  prod uuid;
  rid uuid;
  made int := 0;
  target int;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  select id into so from public.users where email = 'so@biory.local';
  select id into prod from public.products where active and kind = 'saleable' order by code limit 1;
  target := greatest(
    10 - (select count(*)::int from public.requisitions),
    10 - (select count(*)::int from public.requisitions where status in ('ISSUED', 'RECEIVED'))
  );
  while made < target loop
    made := made + 1;
    rid := public.save_requisition(
      null,
      so,
      jsonb_build_array(jsonb_build_object('product_id', prod, 'qty', 4)),
      format('Sample requisition %s', made),
      true,
      false
    );
    perform public.issue_requisition(rid);
    if made % 2 = 0 then
      perform public.receive_requisition(rid);
    end if;
  end loop;
end $$;

do $$
declare
  so uuid;
  chemist uuid;
  prod uuid;
  made int := 0;
  need int;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  select id into so from public.users where email = 'so@biory.local';
  select id into chemist from public.chemists where assigned_so = so and status = 'active' order by business_name limit 1;
  need := greatest(0, 10 - (select count(*)::int from public.orders));
  select p.id into prod
  from public.products p
  where p.active and p.kind = 'saleable'
  order by public._usable_qty(public.central_location(), p.id) desc
  limit 1;
  if prod is null then
    select id into prod from public.products where active and kind = 'saleable' order by code limit 1;
  end if;
  if prod is not null and public._usable_qty(public.central_location(), prod) < need * 2 then
    perform public.receive_stock(prod, 'SMPL-ORD', date '2026-01-01', date '2028-12-31', greatest(40, need * 2), 'OPENING', 'SAMPLE', 'Stock for sample orders');
  end if;
  while made < need loop
    made := made + 1;
    perform public.create_order(
      chemist,
      jsonb_build_array(jsonb_build_object('product_id', prod, 'qty', 2)),
      0,
      0,
      'Sample order',
      gen_random_uuid(),
      so
    );
  end loop;
end $$;

do $$
declare
  ord record;
  items jsonb;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  for ord in
    select id from public.orders
    where status = 'CONFIRMED' and delivery_status = 'NOT_DELIVERED' and remarks = 'Sample order'
  loop
    select jsonb_agg(jsonb_build_object('order_item_id', id, 'qty', qty - delivered_qty))
      into items
    from public.order_items
    where order_id = ord.id and qty > delivered_qty;
    if items is not null then
      perform public.deliver_order(ord.id, items, 'Sample delivery', gen_random_uuid());
    end if;
  end loop;
end $$;

do $$
declare
  so uuid;
  central uuid;
  dest uuid;
  batch uuid;
  ord record;
  due numeric;
  i int;
  bal numeric;
  cats text[] := array['TRAVEL','FUEL','FOOD','ACCOMMODATION','COMMUNICATION','ENTERTAINMENT','OFFICE','OTHER','SAMP1','SAMP2'];
  doc uuid;
  promo uuid;
begin
  select id into so from public.users where email = 'so@biory.local';
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  central := public.central_location();
  dest := public.so_location(so);
  select p.id into promo from public.products p where p.code = 'PRM-LIT';
  select sb.batch_id into batch
  from public.stock_balances sb
  where sb.location_id = central and sb.product_id = promo and sb.qty >= 15
  order by sb.qty desc
  limit 1;
  if batch is not null and dest is not null
     and coalesce((select qty from public.stock_balances where location_id = dest and product_id = promo), 0) < 12 then
    perform public.transfer_stock(central, dest, batch, 15, 'Sample promo for doctor visits');
  end if;

  perform set_config('app.user_id', so::text, true);

  for ord in
    select id, delivered_value - collected_value as due
    from public.orders
    where so_id = so and delivered_value > collected_value
    order by order_no
  loop
    exit when (select count(*) from public.collections) >= 10;
    due := ord.due;
    if due > 1 then
      perform public.record_collection(ord.id, round(due / 2, 2), 'CASH', null, public.today_bd(), 'Sample collection', gen_random_uuid());
    end if;
    exit when (select count(*) from public.collections) >= 10;
    select delivered_value - collected_value into due from public.orders where id = ord.id;
    if due > 0 then
      perform public.record_collection(ord.id, due, 'CASH', null, public.today_bd(), 'Sample collection balance', gen_random_uuid());
    end if;
  end loop;

  bal := public.wallet_balance(so);
  i := 0;
  while (select count(*) from public.deposits) < 10 and bal > 20 loop
    i := i + 1;
    perform public.submit_deposit(
      least(50, bal - 10),
      'CASH',
      null,
      null,
      null,
      public.today_bd(),
      'Head office',
      format('Sample deposit %s', i),
      null,
      gen_random_uuid()
    );
    bal := public.wallet_balance(so);
  end loop;

  i := 0;
  while (select count(*) from public.expenses) < 10 loop
    i := i + 1;
    perform public.submit_expense(
      public.today_bd(),
      cats[1 + ((i - 1) % array_length(cats, 1))],
      100 + i * 25,
      format('Sample expense for field work %s', i),
      '{}',
      gen_random_uuid()
    );
  end loop;

  select id into doc from public.doctors where assigned_so = so and status = 'active' order by name limit 1;
  i := 0;
  while (select count(*) from public.doctor_visits) < 10 loop
    i := i + 1;
    if i <= 8 and exists (
      select 1 from public.stock_balances sb
      join public.products p on p.id = sb.product_id
      where sb.location_id = dest and p.kind = 'promotional' and sb.qty > 0
    ) then
      perform public.record_doctor_visit(
        doc,
        public.today_bd(),
        time '10:00',
        time '10:20',
        null,
        null,
        'Detailing',
        format('Sample visit %s', i),
        jsonb_build_array(jsonb_build_object('product_id', promo, 'qty', 1)),
        gen_random_uuid()
      );
    else
      perform public.record_doctor_visit(
        doc,
        public.today_bd(),
        time '11:00',
        time '11:15',
        null,
        null,
        'Follow up',
        format('Sample visit %s', i),
        '[]'::jsonb,
        gen_random_uuid()
      );
    end if;
  end loop;
end $$;

do $$
declare
  central uuid;
  dest record;
  row record;
  have int;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  central := public.central_location();
  for dest in select id from public.locations where kind = 'so' loop
    select count(*) into have from public.stock_balances where location_id = dest.id and qty > 0;
    for row in
      select sb.batch_id
      from public.stock_balances sb
      where sb.location_id = central and sb.qty >= 2
        and not exists (
          select 1 from public.stock_balances x
          where x.location_id = dest.id and x.batch_id = sb.batch_id and x.qty > 0
        )
      order by sb.qty desc
      limit greatest(0, 10 - have)
    loop
      perform public.transfer_stock(central, dest.id, row.batch_id, 1, 'Sample stock so each officer list can be checked');
    end loop;
  end loop;
end $$;

-- Opening challans, adjustment challans, attendance punches, and audit rows.
do $$
declare
  prod uuid;
  i int := 0;
  have int;
  eid uuid;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  select count(*) into have from public.opening_entries where status <> 'CANCELLED';
  select id into prod from public.products where active order by code limit 1;
  if prod is null then return; end if;
  while have + i < 10 loop
    i := i + 1;
    eid := public.save_opening_entry(
      null,
      public.today_bd(),
      jsonb_build_array(jsonb_build_object(
        'product_id', prod, 'qty', 5,
        'batch_no', format('LIST-OPN-%s', have + i),
        'mfg', '2026-01-01', 'expiry', '2028-12-31'
      )),
      format('Sample opening %s', have + i),
      gen_random_uuid()
    );
    perform public.approve_opening_entry(eid);
  end loop;
end $$;

do $$
declare
  loc uuid;
  prod uuid;
  batch uuid;
  i int := 0;
  have int;
  eid uuid;
begin
  perform set_config('app.user_id', (select id::text from public.users where email = 'admin@biory.local'), true);
  loc := public.central_location();
  select count(*) into have from public.adjustment_entries where status <> 'CANCELLED';
  select b.product_id, b.id into prod, batch
  from public.batches b
  join public.stock_balances sb on sb.batch_id = b.id and sb.location_id = loc
  where sb.qty > 0
  order by sb.qty desc
  limit 1;
  if prod is null then return; end if;
  while have + i < 10 loop
    i := i + 1;
    eid := public.save_adjustment_entry(
      null,
      public.today_bd(),
      loc,
      jsonb_build_array(jsonb_build_object(
        'product_id', prod, 'batch_id', batch,
        'qty', 1, 'movement_type', 'MANUAL_ADJUSTMENT_IN',
        'reason', format('Sample adjustment %s', have + i)
      )),
      format('Sample adjustment %s', have + i),
      gen_random_uuid()
    );
    perform public.approve_adjustment_entry(eid);
  end loop;
end $$;

insert into public.attendance_punches (so_id, work_date, punched_in_at, punched_out_at)
select u.id,
  public.today_bd() - g.n,
  ((public.today_bd() - g.n)::timestamp + time '09:00') at time zone 'Asia/Dhaka',
  ((public.today_bd() - g.n)::timestamp + time '09:00' + (
    case g.n % 3 when 1 then interval '2 hours' when 2 then interval '4 hours' else interval '7 hours' end
  )) at time zone 'Asia/Dhaka'
from public.users u
join public.user_roles r on r.user_id = u.id and r.role = 'sales_officer'
cross join generate_series(0, 9) as g(n)
where not exists (
  select 1 from public.attendance_punches a
  where a.so_id = u.id and a.work_date = public.today_bd() - g.n
);

insert into public.audit_log (actor, action, entity, entity_id, reason)
select (select id from public.users where email = 'admin@biory.local'),
  'SAMPLE', 'sample', n::text, format('Sample audit %s', n)
from generate_series(1, greatest(0, 10 - (select count(*)::int from public.audit_log))) as g(n);

commit;

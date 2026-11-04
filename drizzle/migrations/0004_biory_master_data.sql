-- ============ BIORY MASTER DATA (from Sales_Stock_Payment1.xlsx) ============
-- Products, territories, chemists and doctors from the company workbook.
-- Re-runnable: rows are matched on their unique code/name and refreshed or skipped.

-- Company name (only if still the template default).
update public.app_settings set company_name = 'BIORY Corporation' where id = 1 and company_name = 'PharmaField Ltd.';

-- Products. MRP per pack; trade discount 15% gives TP/Box (e.g. Capsotin 450 → 382.50).
-- The workbook lists Qtone under code P003 (same as Termina); it is stored as P004 because codes are unique.
insert into public.products (code, name, pack_size, dosage_form, category, kind, mrp, trade_discount_pct, reorder_level) values
  ('P001', 'Capsotin', '30s (pot)', null, null, 'saleable', 450, 15, 50),
  ('P002', 'Linazin',  '30s (pot)', null, null, 'saleable', 480, 15, 50),
  ('P003', 'Termina',  '30s (pot)', null, null, 'saleable', 450, 15, 50),
  ('P004', 'Qtone',    '20s (pot)', null, null, 'saleable', 600, 15, 50)
on conflict (code) do update set
  name = excluded.name, pack_size = excluded.pack_size, mrp = excluded.mrp,
  trade_discount_pct = excluded.trade_discount_pct, active = true, updated_at = now();

-- Promotional items used on doctor/chemist visits (Lit, Pad, Pen, Gift columns of VisitInfo).
insert into public.products (code, name, dosage_form, pack_size, category, kind, mrp, trade_discount_pct, reorder_level) values
  ('PRM-LIT',  'Product Literature', 'Stationery', '1 pc', 'Promotional', 'promotional', 0, 0, 200),
  ('PRM-GIFT', 'Doctor Gift',        'Gift',       '1 pc', 'Promotional', 'promotional', 0, 0, 20)
on conflict (code) do nothing;

-- Retire the template sample medicines (kept for history, hidden from new orders).
update public.products set active = false, updated_at = now()
where code in ('NAP500', 'SEC20', 'MON10', 'AZI500', 'FEX120', 'ORS01', 'SMP-SEC') and active;

-- Territories of the MSE team (Employee sheet): name = territory, area = district.
insert into public.territories (name, area, zone) values
  ('Dohar', 'Dhaka', 'Dhaka'),
  ('Keraniganj', 'Dhaka', 'Dhaka'),
  ('Nimtola', 'Dhaka', 'Dhaka'),
  ('Jurain', 'Dhaka', 'Dhaka'),
  ('Nobabganj', 'Dhaka', 'Dhaka'),
  ('Gopalganj', 'Gopalganj', 'Dhaka'),
  ('Kishorganj', 'Kishorganj', 'Dhaka'),
  ('Monohardi', 'Narsingdi', 'Dhaka')
on conflict (name) do nothing;

-- Chemists of MSE BRY001 (Zahangir, Dohar). Assign them to the SO once that account exists.
insert into public.chemists (code, business_name, district, territory_id)
select v.code, v.name, 'Dhaka', (select id from public.territories where name = 'Dohar')
from (values
  ('B001C00001', 'Sotota Pharmacy'),
  ('B001C00002', 'Banu Pharmacy'),
  ('B001C00003', 'Maleka Pharmacy')
) as v(code, name)
on conflict (code) do nothing;

-- Doctors of MSE BRY001.
insert into public.doctors (code, name, address, territory_id)
select v.code, v.name, 'Dhaka', (select id from public.territories where name = 'Dohar')
from (values
  ('B001D00001', 'Dr Takibul Alam'),
  ('B001D00002', 'Dr Emtiaz Ahmed'),
  ('B001D00003', 'Dr Akbar Hossen')
) as v(code, name)
on conflict (code) do nothing;

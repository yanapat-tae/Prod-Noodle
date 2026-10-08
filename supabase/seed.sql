-- Base setup. Full dishes and prices are in menu-seed.sql.
-- No QR secrets or Auth accounts are created by this script.
begin;

insert into public.restaurant_tables(table_number, label)
select n, 'โต๊ะ ' || n::text from generate_series(1, 8) n
on conflict (table_number) do nothing;

insert into public.menu_categories(code, name, sort_order) values
  ('noodles', 'ก๋วยเตี๋ยว', 1), ('soup-only', 'เกาเหลา', 2),
  ('rice', 'ข้าวและบะหมี่', 3), ('snacks', 'ของทานเล่น / เพิ่มพิเศษ', 4),
  ('drinks', 'เครื่องดื่ม', 5), ('desserts', 'ของหวาน', 6)
on conflict (code) do nothing;

insert into public.option_groups(code, name) values
  ('noodle', 'เส้น'), ('broth', 'รสชาติ / น้ำซุป'),
  ('serving', 'น้ำ / แห้ง'), ('topping', 'ท็อปปิ้งเสริม')
on conflict (code) do nothing;

insert into public.menu_options(group_id, code, name, aliases, price_delta_satang)
select g.id, v.code, v.name, v.aliases, v.delta_satang
from public.option_groups g cross join (values
  ('sen-lek', 'เส้นเล็ก', array['เล็ก']::text[], 0::bigint),
  ('sen-yai', 'เส้นใหญ่', array['ใหญ่']::text[], 0::bigint),
  ('sen-mee', 'เส้นหมี่', array['หมี่ขาว']::text[], 0::bigint),
  ('bamee', 'บะหมี่', array['หมี่เหลือง']::text[], 0::bigint),
  ('woonsen', 'วุ้นเส้น', array[]::text[], 0::bigint),
  ('mama', 'มาม่า', array['มามา']::text[], 500::bigint)
) v(code, name, aliases, delta_satang)
where g.code = 'noodle'
on conflict (group_id, code) do nothing;

-- menu-seed.sql attaches the allowed groups/options for each dish.
commit;

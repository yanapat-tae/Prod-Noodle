begin;
select pg_advisory_xact_lock(814208);
update public.menu_items set description='สำหรับ 2–3 ท่าน' where code='yentafo-hotpot';
update public.menu_items set name='ไอศกรีมมหาชัย' where code='mahachai-ice-cream';
-- Remove only dish-option links; global options and historical snapshots remain.
delete from public.menu_item_options io using public.menu_items m, public.menu_options o
where io.menu_item_id=m.id and io.option_id=o.id and m.code='crispy-pork-rice'
 and o.group_id=(select id from public.option_groups where code='topping')
 and o.code in ('pork-slices','minced-pork');
update public.menu_item_option_groups ig set max_selections=2
from public.menu_items m,public.option_groups g
where ig.menu_item_id=m.id and ig.group_id=g.id and m.code='crispy-pork-rice' and g.code='topping';
commit;

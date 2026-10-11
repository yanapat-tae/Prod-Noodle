-- Independent safe data/profile preparation; compatible with the current frontend.
begin;
alter table public.admins drop constraint admins_account_slot_check;
alter table public.admins add constraint admins_account_slot_check check(account_slot between 1 and 6);
-- Only the targeted preparation note; no names/prices/category/images change.
update public.menu_items set prep_notes=array['ไม่ใส่น้ำตาลทรายแดง'] where code='grass-jelly' and name='เฉาก๊วยโบราณ';
commit;

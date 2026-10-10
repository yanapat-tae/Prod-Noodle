-- Rename only the existing drink; retain prices, availability and bill snapshots.
update public.menu_items
set name = 'น้ำอัดลม - โค้ก'
where code = 'soft-drink' and name = 'น้ำอัดลม';

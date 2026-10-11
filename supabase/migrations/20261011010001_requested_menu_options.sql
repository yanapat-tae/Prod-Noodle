-- Target only requested menus; preserve owner prices, historical bills and other modifiers.
begin;
do $$
declare g jsonb; o jsonb; gid uuid; oid uuid; mid uuid; n integer:=0; pos integer;
begin
 for g in select value from jsonb_array_elements('[{"code":"ice-toppings","name":"เลือกเครื่อง","min":0,"max":4,"limitsByVariant":{"normal":{"min":0,"max":3},"special":{"min":0,"max":4}},"options":[{"code":"mung-bean","name":"ถั่วทอง","priceSatang":0},{"code":"candied-pumpkin","name":"ฟักทองเชื่อม","priceSatang":0},{"code":"candied-sweet-potato","name":"มันเชื่อม","priceSatang":0},{"code":"attap-seed","name":"ลูกชิด","priceSatang":0},{"code":"candied-pineapple","name":"สับปะรดเชื่อม","priceSatang":0}]},{"code":"ice-peanuts","name":"ถั่วลิสง","min":1,"max":1,"options":[{"code":"include","name":"ถั่วลิสง (ใส่ให้อยู่แล้ว)","priceSatang":0,"defaultQuantity":1},{"code":"omit","name":"ไม่ใส่ถั่วลิสง","priceSatang":0}]},{"code":"basil-extras","name":"เพิ่มพิเศษ","min":0,"max":1,"options":[{"code":"fried-egg","name":"เพิ่มไข่ดาว","priceSatang":1000}]}]'::jsonb) loop
  insert into public.option_groups(code,name) values(g->>'code',g->>'name') on conflict(code) do nothing;
  select id into gid from public.option_groups where code=g->>'code';
  for mid in select id from public.menu_items where (g->>'code' in ('ice-toppings','ice-peanuts') and code='mahachai-ice-cream')
   or (g->>'code'='basil-extras' and code in ('menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef','menu-cea2ec9a-f037-475c-885e-a4dd03a537da')) loop
   if exists(select 1 from public.menu_item_option_groups where menu_item_id=mid and group_id=gid) then continue; end if;
   select coalesce(max(sort_order),-1)+1 into pos from public.menu_item_option_groups where menu_item_id=mid;
   insert into public.menu_item_option_groups(menu_item_id,group_id,min_selections,max_selections,name_override,sort_order,limits_by_variant)
   values(mid,gid,(g->>'min')::smallint,(g->>'max')::smallint,g->>'name',pos,coalesce(g->'limitsByVariant','{}'));
   n:=0; for o in select value from jsonb_array_elements(g->'options') loop
    insert into public.menu_options(group_id,code,name,price_delta_satang) values(gid,o->>'code',o->>'name',(o->>'priceSatang')::bigint) on conflict(group_id,code) do nothing;
    select id into oid from public.menu_options where group_id=gid and code=o->>'code';
    insert into public.menu_item_options(menu_item_id,group_id,option_id,price_override_satang,default_quantity,name_override,sort_order)
    values(mid,gid,oid,(o->>'priceSatang')::bigint,coalesce((o->>'defaultQuantity')::smallint,0),o->>'name',n); n:=n+1;
   end loop;
   update public.menu_items set revision=revision where id=mid;
  end loop;
 end loop;
end $$;
update public.menu_items set customer_copy=customer_copy||'{"variantLabel":"ขนาดไอศกรีม"}'::jsonb
 where code='mahachai-ice-cream' and not (customer_copy ? 'variantLabel');
commit;

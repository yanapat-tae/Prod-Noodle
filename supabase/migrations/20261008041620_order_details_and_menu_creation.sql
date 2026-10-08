-- Add bounded order snapshots and owner-created menus without changing historic rows.
begin;
alter table public.orders add column takeaway_details jsonb,
 add constraint orders_takeaway_details_check check (takeaway_details is null or (channel='takeaway' and jsonb_typeof(takeaway_details)='object'));
alter table public.order_items add column free_note text not null default '',
 add constraint order_items_free_note_length check (char_length(free_note)<=300);
alter table public.menu_items add column creation_payload jsonb;

-- Match JavaScript String.trim(), including non-ASCII whitespace, at the API boundary.
create function public.app_trim(p_text text) returns text language sql immutable strict set search_path='' as $$
 select btrim(p_text, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
  chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
revoke all on function public.app_trim(text) from public,anon,authenticated;
grant execute on function public.app_trim(text) to service_role;

create or replace function public.order_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('id',o.id,'channel',o.channel,'tableNumber',t.table_number,'queueNumber',o.queue_number,
 'takeaway',o.takeaway_details,'visitId',o.table_session_id,'status',o.fulfillment_status,'totalSatang',o.total_satang,'createdAt',o.created_at,'paidAt',o.paid_at,
 'paymentMethod',(select p.method from public.payment_transactions p where p.order_id=o.id and p.kind='capture' and p.status='succeeded' order by p.posted_at limit 1),
 'refundedAt',(select max(p.posted_at) from public.payment_transactions p where p.order_id=o.id and p.kind='refund' and p.status='succeeded'),
 'refundedSatang',(select coalesce(sum(p.amount_satang),0) from public.payment_transactions p where p.order_id=o.id and p.kind='refund' and p.status='succeeded'),
 'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'itemCode',m.code,'variantCode',v.code,'name',i.menu_name_snapshot,'variantName',i.variant_name_snapshot,
 'unit',i.unit_snapshot,'quantity',i.quantity,'unitSatang',i.base_unit_satang+i.options_unit_satang,'totalSatang',i.line_net_satang,
 'freeNote',coalesce(i.free_note,''),'notes',case when i.notes is null or i.notes='' then '[]'::jsonb else to_jsonb(string_to_array(i.notes,' · ')) end,
 'options','[]'::jsonb,'optionNames',(select coalesce(jsonb_agg(x.option_name_snapshot order by x.id),'[]') from public.order_item_options x where x.order_item_id=i.id)) order by i.id),'[]')
 from public.order_items i join public.menu_items m on m.id=i.menu_item_id join public.menu_variants v on v.id=i.variant_id where i.order_id=o.id))
from public.orders o left join public.restaurant_tables t on t.id=o.table_id where o.id=p_id;
$$;

create or replace function public.place_order(p_payload jsonb,p_key uuid,p_hash text,p_customer_hash text default null,p_actor uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare c public.customer_sessions; e public.qr_entrypoints; old public.orders; ch public.order_channel;
 tab uuid; visit uuid; num integer; actor_name text; oid uuid:=gen_random_uuid(); iid uuid;
 line jsonb; opt jsonb; m public.menu_items; v public.menu_variants; quantity integer; extra bigint; total bigint:=0;
 details jsonb; customer_name text; delivery_address text; delivery_phone text; village boolean; free_note_value text;
 grp record; chosen record; line_count integer; note text; notes text; date_today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 perform pg_advisory_xact_lock(814208);
 if p_actor is not null then actor_name:=public.require_actor(p_actor); else c:=public.valid_customer(p_customer_hash); actor_name:='ลูกค้า'; end if;
 select * into old from public.orders where idempotency_key=p_key;
 if old.id is not null then
  if old.request_hash<>p_hash or old.created_by is distinct from p_actor or old.customer_session_id is distinct from c.id
  then raise exception 'รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว' using errcode='PT409'; end if;
  return public.order_json(old.id);
 end if;
 if jsonb_typeof(p_payload->'lines') is distinct from 'array' then raise exception 'กรุณาเพิ่มอาหารลงตะกร้า' using errcode='PT400'; end if;
 line_count:=jsonb_array_length(p_payload->'lines');
 if line_count<1 or line_count>30 then raise exception 'รายการเกินขอบเขต' using errcode='PT400'; end if;
 if p_actor is null then
  select * into e from public.qr_entrypoints where id=c.entrypoint_id and is_active;
  if e.id is null then raise exception 'QR หมดอายุ กรุณาสแกนใหม่' using errcode='PT401'; end if;
  ch:=e.kind::public.order_channel; tab:=e.table_id; visit:=c.table_session_id;
  if (select count(*) from public.orders where customer_session_id=c.id and created_at>now()-interval '10 minutes')>=20
  then raise exception 'ส่งออเดอร์หลายครั้ง กรุณาแจ้งพนักงาน' using errcode='PT429'; end if;
 else
  if p_payload->>'channel' not in ('dine_in','takeaway') or p_payload->>'channel' is null then raise exception 'ช่องทางไม่ถูกต้อง' using errcode='PT400'; end if;
  ch:=(p_payload->>'channel')::public.order_channel;
  if ch='dine_in' then
   select id into tab from public.restaurant_tables where table_number=(p_payload->>'tableNumber')::integer and is_active;
   if tab is null then raise exception 'เลขโต๊ะไม่ถูกต้อง' using errcode='PT400'; end if;
   select id into visit from public.table_sessions where table_id=tab and closed_at is null;
   if visit is null then insert into public.table_sessions(table_id,opened_by) values(tab,p_actor) returning id into visit; end if;
  end if;
 end if;
 -- Legacy callers may omit takeaway details; new callers receive normalized snapshots.
 details:=p_payload->'takeaway';
 if details is not null and details<>'null'::jsonb then
  if ch<>'takeaway' or jsonb_typeof(details) is distinct from 'object' then
   raise exception 'ข้อมูลกลับบ้านไม่ถูกต้อง' using errcode='PT400';
  end if;
  if jsonb_typeof(details->'customerName') is distinct from 'string'
   or jsonb_typeof(details->'villageDelivery') is distinct from 'boolean'
   or jsonb_typeof(details->'deliveryAddress') is distinct from 'string'
   or jsonb_typeof(details->'deliveryPhone') is distinct from 'string' then
   raise exception 'ข้อมูลกลับบ้านไม่ถูกต้อง' using errcode='PT400';
  end if;
  customer_name:=public.app_trim(details->>'customerName');
  delivery_address:=public.app_trim(details->>'deliveryAddress');
  delivery_phone:=public.app_trim(details->>'deliveryPhone');
  village:=(details->>'villageDelivery')::boolean;
  if char_length(customer_name) not between 1 and 80 or char_length(delivery_address)>200 or char_length(delivery_phone)>30 then
   raise exception 'ข้อมูลกลับบ้านยาวเกินขอบเขต' using errcode='PT400';
  end if;
  if village and (delivery_address='' or delivery_phone !~ '^[0-9+()[:space:]-]{8,30}$'
   or char_length(regexp_replace(delivery_phone,'[^0-9]','','g')) not between 9 and 15) then
   raise exception 'กรุณาตรวจบ้านเลขที่และเบอร์ติดต่อสำหรับจัดส่ง' using errcode='PT400';
  end if;
  details:=jsonb_build_object('customerName',customer_name,'villageDelivery',village,
   'deliveryAddress',case when village then delivery_address else '' end,
   'deliveryPhone',case when village then delivery_phone else '' end);
 else details:=null;
 end if;
 -- Insert first within this transaction; every validation failure rolls it back.
 if ch='takeaway' then num:=public.next_takeaway_queue(date_today); end if;
 insert into public.orders(id,channel,source,table_id,table_session_id,customer_session_id,business_date,queue_number,idempotency_key,request_hash,gross_satang,created_by,takeaway_details)
 values(oid,ch,case when p_actor is null then 'qr' else 'pos' end,tab,visit,c.id,date_today,num,p_key,p_hash,0,p_actor,details);
 for line in select value from jsonb_array_elements(p_payload->'lines') loop
  select * into m from public.menu_items where code=line->>'itemCode' and is_active and not is_sold_out;
  if m.id is null then raise exception 'เมนูนี้ยังไม่พร้อมขาย' using errcode='PT400'; end if;
  select * into v from public.menu_variants where menu_item_id=m.id and code=line->>'variantCode' and is_active;
  quantity:=(line->>'quantity')::integer;
  if v.id is null or quantity is null or quantity<1 or quantity>20 or (line->>'quantity') !~ '^[0-9]+$'
  then raise exception 'ขนาดหรือจำนวนอาหารไม่ถูกต้อง' using errcode='PT400'; end if;
  if jsonb_typeof(line->'options') is distinct from 'array' or jsonb_typeof(line->'notes') is distinct from 'array'
  then raise exception 'ตัวเลือกไม่ถูกต้อง' using errcode='PT400'; end if;
  if jsonb_array_length(line->'options')>20 or jsonb_array_length(line->'notes')>5 then raise exception 'ตัวเลือกเกินขอบเขต' using errcode='PT400'; end if;
  if exists(select 1 from jsonb_array_elements(line->'options') x group by x->>'groupCode',x->>'optionCode' having count(*)>1)
  then raise exception 'ตัวเลือกซ้ำ' using errcode='PT400'; end if;
  for grp in select g.code,ig.min_selections,ig.max_selections from public.menu_item_option_groups ig join public.option_groups g on g.id=ig.group_id where ig.menu_item_id=m.id loop
   select count(*) into num from jsonb_array_elements(line->'options') x where x->>'groupCode'=grp.code;
   if num<grp.min_selections or num>grp.max_selections then raise exception 'กรุณาเลือกตัวเลือกอาหารให้ครบ' using errcode='PT400'; end if;
  end loop;
  notes:='';
  if exists(select 1 from jsonb_array_elements_text(line->'notes') x group by x having count(*)>1) then raise exception 'หมายเหตุซ้ำ' using errcode='PT400'; end if;
  for note in select value from jsonb_array_elements_text(line->'notes') loop
   if note is null or not (note=any(m.prep_notes)) then raise exception 'หมายเหตุไม่ถูกต้อง' using errcode='PT400'; end if;
   notes:=notes||case when notes='' then '' else ' · ' end||note;
  end loop;
  if line ? 'freeNote' and jsonb_typeof(line->'freeNote') is distinct from 'string' then
   raise exception 'หมายเหตุอาหารไม่ถูกต้อง' using errcode='PT400';
  end if;
  free_note_value:=public.app_trim(coalesce(line->>'freeNote',''));
  if char_length(free_note_value)>300 then raise exception 'หมายเหตุอาหารยาวได้ไม่เกิน 300 ตัวอักษร' using errcode='PT400'; end if;
  extra:=0; iid:=gen_random_uuid();
  insert into public.order_items(id,order_id,menu_item_id,variant_id,menu_name_snapshot,variant_name_snapshot,unit_snapshot,quantity,base_unit_satang,notes,free_note)
  values(iid,oid,m.id,v.id,m.name,v.name,m.unit,quantity,v.price_satang,nullif(notes,''),free_note_value);
  for opt in select value from jsonb_array_elements(line->'options') loop
   select o.id,o.name,g.name group_name,coalesce(io.price_override_satang,o.price_delta_satang) price into chosen
   from public.menu_item_options io join public.menu_options o on o.id=io.option_id join public.option_groups g on g.id=io.group_id
   where io.menu_item_id=m.id and g.code=opt->>'groupCode' and o.code=opt->>'optionCode' and o.is_active;
   if chosen.id is null or opt->>'quantity' is distinct from '1' then raise exception 'เมนูนี้ไม่รองรับตัวเลือกที่เลือก' using errcode='PT400'; end if;
   extra:=extra+chosen.price;
   insert into public.order_item_options(order_item_id,option_id,group_name_snapshot,option_name_snapshot,quantity,unit_price_satang)
   values(iid,chosen.id,chosen.group_name,chosen.name,1,chosen.price);
  end loop;
  update public.order_items set options_unit_satang=extra where id=iid;
  total:=total+(v.price_satang+extra)*quantity;
 end loop;
 if total<=0 or p_payload->>'expectedTotalSatang' is null or total<>(p_payload->>'expectedTotalSatang')::bigint
 then raise exception 'ราคาเปลี่ยน กรุณาตรวจตะกร้าอีกครั้ง' using errcode='PT409'; end if;
 update public.orders set gross_satang=total where id=oid;
 insert into public.order_status_events(order_id,next_status,actor_id,actor_name_snapshot) values(oid,'new',p_actor,actor_name);
 return public.order_json(oid);
end $$;

-- The original normalized creation payload is the retry identity. Later price and
-- availability edits do not change it. Existing seeded menu codes cannot be reused.
create function public.create_menu(p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
 normalized jsonb; variants jsonb:='[]'::jsonb; groups jsonb:='[]'::jsonb; notes jsonb:='[]'::jsonb;
 variant jsonb; entry jsonb; value_text text; variant_code text; variant_name text; price numeric;
 menu_code text; menu_name text; description_text text; unit_text text; category_code text;
 category_id_value uuid; menu_id uuid; old public.menu_items; template record; n integer:=0;
begin
 perform pg_advisory_xact_lock(814208);
 perform public.require_actor(p_actor,true);
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'ข้อมูลเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 if (select count(*) from jsonb_object_keys(p_payload))<>8
  or not (p_payload ?& array['code','name','category','description','unit','variants','optionGroupCodes','prepNotes']) then
  raise exception 'ข้อมูลเมนูไม่ถูกต้อง' using errcode='PT400';
 end if;
 if jsonb_typeof(p_payload->'code') is distinct from 'string' or (p_payload->>'code') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
  or jsonb_typeof(p_payload->'name') is distinct from 'string'
  or jsonb_typeof(p_payload->'category') is distinct from 'string'
  or jsonb_typeof(p_payload->'description') is distinct from 'string'
  or jsonb_typeof(p_payload->'unit') is distinct from 'string' then
  raise exception 'ข้อมูลเมนูไม่ถูกต้อง' using errcode='PT400';
 end if;
 menu_code:=p_payload->>'code'; menu_name:=public.app_trim(p_payload->>'name');
 category_code:=p_payload->>'category'; description_text:=public.app_trim(p_payload->>'description'); unit_text:=public.app_trim(p_payload->>'unit');
 if char_length(menu_name) not between 1 and 120 or char_length(description_text)>500 or char_length(unit_text) not between 1 and 20 then
  raise exception 'ข้อมูลเมนูยาวเกินขอบเขต' using errcode='PT400';
 end if;
 if jsonb_typeof(p_payload->'variants') is distinct from 'array'
  or jsonb_typeof(p_payload->'optionGroupCodes') is distinct from 'array'
  or jsonb_typeof(p_payload->'prepNotes') is distinct from 'array' then
  raise exception 'ตัวเลือกเมนูไม่ถูกต้อง' using errcode='PT400';
 end if;
 if jsonb_array_length(p_payload->'variants') not between 1 and 8
  or jsonb_array_length(p_payload->'optionGroupCodes')>8 or jsonb_array_length(p_payload->'prepNotes')>5 then
  raise exception 'ตัวเลือกเมนูเกินขอบเขต' using errcode='PT400';
 end if;
 for variant in select value from jsonb_array_elements(p_payload->'variants') loop
  if jsonb_typeof(variant) is distinct from 'object' then raise exception 'ขนาดอาหารไม่ถูกต้อง' using errcode='PT400'; end if;
  if (select count(*) from jsonb_object_keys(variant))<>3 or not (variant ?& array['code','name','priceSatang'])
   or jsonb_typeof(variant->'code') is distinct from 'string' or (variant->>'code') !~ '^[a-z0-9][a-z0-9-]{0,79}$'
   or jsonb_typeof(variant->'name') is distinct from 'string' or jsonb_typeof(variant->'priceSatang') is distinct from 'number' then
   raise exception 'ขนาดอาหารไม่ถูกต้อง' using errcode='PT400';
  end if;
  variant_code:=variant->>'code'; variant_name:=public.app_trim(variant->>'name'); price:=(variant->>'priceSatang')::numeric;
  if char_length(variant_name) not between 1 and 60 or price<=0 or price>100000 or price<>trunc(price) then
   raise exception 'ขนาดหรือราคาอาหารไม่ถูกต้อง' using errcode='PT400';
  end if;
  if exists(select 1 from jsonb_array_elements(variants) x where x->>'code'=variant_code) then
   raise exception 'รหัสขนาดอาหารซ้ำ' using errcode='PT400';
  end if;
  variants:=variants||jsonb_build_array(jsonb_build_object('code',variant_code,'name',variant_name,'priceSatang',price::bigint));
 end loop;
 for entry in select value from jsonb_array_elements(p_payload->'optionGroupCodes') loop
  if jsonb_typeof(entry) is distinct from 'string' then raise exception 'กลุ่มตัวเลือกไม่ถูกต้อง' using errcode='PT400'; end if;
  value_text:=entry #>> '{}';
  if groups ? value_text then raise exception 'กลุ่มตัวเลือกซ้ำ' using errcode='PT400'; end if;
  groups:=groups||jsonb_build_array(value_text);
 end loop;
 for entry in select value from jsonb_array_elements(p_payload->'prepNotes') loop
  if jsonb_typeof(entry) is distinct from 'string' then raise exception 'หมายเหตุไม่ถูกต้อง' using errcode='PT400'; end if;
  value_text:=public.app_trim(entry #>> '{}');
  if char_length(value_text) not between 1 and 80 then raise exception 'หมายเหตุยาวเกินขอบเขต' using errcode='PT400'; end if;
  if notes ? value_text then raise exception 'หมายเหตุซ้ำ' using errcode='PT400'; end if;
  notes:=notes||jsonb_build_array(value_text);
 end loop;
 normalized:=jsonb_build_object('code',menu_code,'name',menu_name,'category',category_code,'description',description_text,
  'unit',unit_text,'variants',variants,'optionGroupCodes',groups,'prepNotes',notes);
 select * into old from public.menu_items where code=menu_code;
 if old.id is not null then
  if old.creation_payload is distinct from normalized then
   raise exception 'รหัสเมนูนี้ใช้กับข้อมูลอื่นแล้ว' using errcode='PT409';
  end if;
  return (select x from jsonb_array_elements(public.menu_catalog()) x where x->>'code'=menu_code);
 end if;
 select c.id into category_id_value from public.menu_categories c
 where c.code=category_code and c.is_active and exists(select 1 from public.menu_items m where m.category_id=c.id and m.is_active);
 if category_id_value is null then raise exception 'กรุณาเลือกหมวดหมู่ที่มีอยู่' using errcode='PT400'; end if;
 insert into public.menu_items(category_id,code,name,description,unit,prep_notes,creation_payload)
 values(category_id_value,menu_code,menu_name,description_text,unit_text,array(select jsonb_array_elements_text(notes)),normalized) returning id into menu_id;
 for variant in select value from jsonb_array_elements(variants) loop
  insert into public.menu_variants(menu_item_id,code,name,price_satang,is_default)
  values(menu_id,variant->>'code',variant->>'name',(variant->>'priceSatang')::bigint,n=0);
  n:=n+1;
 end loop;
 for value_text in select jsonb_array_elements_text(groups) loop
  -- Resolve both cardinality and allowed options from one deterministic active item.
  select ig.* into template from public.menu_item_option_groups ig
   join public.option_groups g on g.id=ig.group_id join public.menu_items m on m.id=ig.menu_item_id
   join public.menu_categories c on c.id=m.category_id
   where g.code=value_text and m.is_active and c.is_active and m.id<>menu_id order by m.code collate "C" limit 1;
  if not found then raise exception 'กรุณาเลือกกลุ่มตัวเลือกที่มีอยู่' using errcode='PT400'; end if;
  insert into public.menu_item_option_groups(menu_item_id,group_id,min_selections,max_selections)
  values(menu_id,template.group_id,template.min_selections,template.max_selections);
  insert into public.menu_item_options(menu_item_id,group_id,option_id,price_override_satang,default_quantity,max_quantity)
  select menu_id,io.group_id,io.option_id,io.price_override_satang,io.default_quantity,io.max_quantity
   from public.menu_item_options io join public.menu_options o on o.id=io.option_id
   where io.menu_item_id=template.menu_item_id and io.group_id=template.group_id and o.is_active;
  if (select count(*) from public.menu_item_options where menu_item_id=menu_id and group_id=template.group_id)<greatest(1,template.min_selections) then
   raise exception 'กลุ่มตัวเลือกไม่มีตัวเลือกที่พร้อมขายเพียงพอ' using errcode='PT400';
  end if;
 end loop;
 return (select x from jsonb_array_elements(public.menu_catalog()) x where x->>'code'=menu_code);
end $$;

-- Preserve invoker execution and deny direct browser calls to privileged mutations.
revoke all on function public.create_menu(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_menu(uuid,jsonb) to service_role;
revoke all on function public.order_json(uuid), public.place_order(jsonb,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.order_json(uuid), public.place_order(jsonb,uuid,text,text,uuid) to service_role;
commit;

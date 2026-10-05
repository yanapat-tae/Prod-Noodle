-- All mutations are single PostgreSQL transactions. The pilot serializes short
-- mutations for one restaurant; no network work happens while holding the lock.
begin;
alter table public.menu_items add column unit text not null default 'ชาม',
  add column prep_notes text[] not null default '{}';
alter table public.order_items add column unit_snapshot text not null default 'ชาม';
create unique index one_takeaway_entrypoint on public.qr_entrypoints(kind) where kind='takeaway';
-- Content hashes identify files; a separate request key allows an owner to
-- intentionally restore an earlier summary without suppressing that change.
alter table public.delivery_import_batches drop constraint delivery_import_batches_channel_content_hash_key;
alter table public.delivery_import_batches add column idempotency_key uuid,
 add constraint delivery_batch_request_key unique(channel,idempotency_key);
create index delivery_content_hash_idx on public.delivery_import_batches(channel,content_hash);

create function public.require_actor(p_actor uuid, p_owner boolean default false)
returns text language plpgsql set search_path = '' as $$
declare n text;
begin
  select display_name into n from public.admins where auth_user_id=p_actor and is_active
    and (not p_owner or role='owner');
  if n is null then raise exception 'เฉพาะพนักงานที่ได้รับสิทธิ์เท่านั้น' using errcode='PT403'; end if;
  return n;
end $$;

create function public.menu_catalog() returns jsonb language sql stable set search_path='' as $$
select coalesce(jsonb_agg(v.data order by v.sort_order,v.created_at,v.code),'[]') from (
 select c.sort_order,m.created_at,m.code,jsonb_build_object(
 'code',m.code,'name',m.name,'category',c.code,'categoryName',c.name,
 'description',coalesce(m.description,''),'unit',m.unit,'available',not m.is_sold_out,
 'prepNotes',to_jsonb(m.prep_notes),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'name',v.name,'priceSatang',v.price_satang) order by v.is_default desc,v.price_satang),'[]') from public.menu_variants v where v.menu_item_id=m.id and v.is_active),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('code',g.code,'name',g.name,'min',ig.min_selections,'max',ig.max_selections,
 'options',(select coalesce(jsonb_agg(jsonb_build_object('code',o.code,'name',o.name,'priceSatang',coalesce(io.price_override_satang,o.price_delta_satang),'defaultQuantity',io.default_quantity) order by o.code),'[]')
 from public.menu_item_options io join public.menu_options o on o.id=io.option_id where io.menu_item_id=m.id and io.group_id=g.id and o.is_active)) order by case g.code when 'noodle' then 1 when 'broth' then 2 else 3 end),'[]')
 from public.menu_item_option_groups ig join public.option_groups g on g.id=ig.group_id where ig.menu_item_id=m.id)) data
 from public.menu_items m join public.menu_categories c on c.id=m.category_id where m.is_active and c.is_active
) v;
$$;

create function public.order_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('id',o.id,'channel',o.channel,'tableNumber',t.table_number,'queueNumber',o.queue_number,
 'visitId',o.table_session_id,'status',o.fulfillment_status,'totalSatang',o.total_satang,'createdAt',o.created_at,'paidAt',o.paid_at,
 'paymentMethod',(select p.method from public.payment_transactions p where p.order_id=o.id and p.kind='capture' and p.status='succeeded' order by p.posted_at limit 1),
 'refundedAt',(select max(p.posted_at) from public.payment_transactions p where p.order_id=o.id and p.kind='refund' and p.status='succeeded'),
 'refundedSatang',(select coalesce(sum(p.amount_satang),0) from public.payment_transactions p where p.order_id=o.id and p.kind='refund' and p.status='succeeded'),
 'lines',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'itemCode',m.code,'variantCode',v.code,'name',i.menu_name_snapshot,'variantName',i.variant_name_snapshot,
 'unit',i.unit_snapshot,'quantity',i.quantity,'unitSatang',i.base_unit_satang+i.options_unit_satang,'totalSatang',i.line_net_satang,
 'notes',case when i.notes is null or i.notes='' then '[]'::jsonb else to_jsonb(string_to_array(i.notes,' · ')) end,
 'options','[]'::jsonb,'optionNames',(select coalesce(jsonb_agg(x.option_name_snapshot order by x.id),'[]') from public.order_item_options x where x.order_item_id=i.id)) order by i.id),'[]')
 from public.order_items i join public.menu_items m on m.id=i.menu_item_id join public.menu_variants v on v.id=i.variant_id where i.order_id=o.id))
from public.orders o left join public.restaurant_tables t on t.id=o.table_id where o.id=p_id;
$$;

create function public.valid_customer(p_hash text) returns public.customer_sessions
language plpgsql stable set search_path='' as $$
declare c public.customer_sessions;
begin
 select * into c from public.customer_sessions where token_hash=p_hash and revoked_at is null and expires_at>now();
 if c.id is null or (c.table_session_id is not null and not exists(select 1 from public.table_sessions where id=c.table_session_id and closed_at is null))
 then raise exception 'รอบโต๊ะหมดอายุ กรุณาสแกน QR ใหม่' using errcode='PT401'; end if;
 return c;
end $$;

create function public.customer_bootstrap(p_entry_hash text,p_new_hash text,p_old_hash text default null)
returns jsonb language plpgsql set search_path='' as $$
declare e public.qr_entrypoints; c public.customer_sessions; visit uuid; tab smallint; resumed boolean:=false;
begin
 perform pg_advisory_xact_lock(814208);
 select * into e from public.qr_entrypoints where token_hash=p_entry_hash and is_active;
 if e.id is null then raise exception 'QR ไม่ถูกต้อง กรุณาแจ้งพนักงาน' using errcode='PT400'; end if;
 select table_number into tab from public.restaurant_tables where id=e.table_id and is_active;
 if e.kind='dine_in' and tab is null then raise exception 'โต๊ะนี้ยังไม่เปิดใช้งาน' using errcode='PT400'; end if;
 if p_old_hash is not null then
   select * into c from public.customer_sessions where token_hash=p_old_hash and entrypoint_id=e.id and revoked_at is null and expires_at>now()
    and (table_session_id is null or exists(select 1 from public.table_sessions where id=table_session_id and closed_at is null));
   resumed:=c.id is not null;
 end if;
 if not resumed then
   if e.kind='dine_in' then
    select id into visit from public.table_sessions where table_id=e.table_id and closed_at is null;
    if visit is null then insert into public.table_sessions(table_id) values(e.table_id) returning id into visit; end if;
   end if;
   if (select count(*) from public.customer_sessions where entrypoint_id=e.id and created_at>now()-interval '1 minute')>=200
   then raise exception 'เปิดเมนูหลายครั้ง กรุณารอสักครู่' using errcode='PT429'; end if;
   insert into public.customer_sessions(entrypoint_id,table_session_id,token_hash,expires_at)
   values(e.id,visit,p_new_hash,now()+interval '4 hours') returning * into c;
 end if;
 return jsonb_build_object('channel',e.kind,'tableNumber',tab,'visitId',c.table_session_id,'resumed',resumed);
end $$;

create function public.customer_orders(p_hash text) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.customer_sessions; r jsonb;
begin
 c:=public.valid_customer(p_hash);
 select coalesce(jsonb_agg(public.order_json(id) order by created_at),'[]') into r from public.orders where customer_session_id=c.id;
 return r;
end $$;

create function public.place_order(p_payload jsonb,p_key uuid,p_hash text,p_customer_hash text default null,p_actor uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare c public.customer_sessions; e public.qr_entrypoints; old public.orders; ch public.order_channel;
 tab uuid; visit uuid; num integer; actor_name text; oid uuid:=gen_random_uuid(); iid uuid;
 line jsonb; opt jsonb; m public.menu_items; v public.menu_variants; quantity integer; extra bigint; total bigint:=0;
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
 -- Insert first within this transaction; every validation failure rolls it back.
 if ch='takeaway' then num:=public.next_takeaway_queue(date_today); end if;
 insert into public.orders(id,channel,source,table_id,table_session_id,customer_session_id,business_date,queue_number,idempotency_key,request_hash,gross_satang,created_by)
 values(oid,ch,case when p_actor is null then 'qr' else 'pos' end,tab,visit,c.id,date_today,num,p_key,p_hash,0,p_actor);
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
  extra:=0; iid:=gen_random_uuid();
  insert into public.order_items(id,order_id,menu_item_id,variant_id,menu_name_snapshot,variant_name_snapshot,unit_snapshot,quantity,base_unit_satang,notes)
  values(iid,oid,m.id,v.id,m.name,v.name,m.unit,quantity,v.price_satang,nullif(notes,''));
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

create function public.staff_order_action(p_actor uuid,p_id uuid,p_action text,p_value text default null)
returns jsonb language plpgsql set search_path='' as $$
declare o public.orders; actor_name text; target public.fulfillment_status; capture public.payment_transactions;
begin
 perform pg_advisory_xact_lock(814208);
 actor_name:=public.require_actor(p_actor,p_action='refund');
 select * into o from public.orders where id=p_id for update;
 if o.id is null then raise exception 'ไม่พบออเดอร์' using errcode='PT404'; end if;
 if p_action='status' then
  target:=p_value::public.fulfillment_status;
  if target is null then raise exception 'สถานะไม่ถูกต้อง' using errcode='PT400'; end if;
  if target<>o.fulfillment_status then
   if not ((o.fulfillment_status='new' and target in ('preparing','cancelled')) or (o.fulfillment_status='preparing' and target in ('ready','cancelled')) or (o.fulfillment_status='ready' and target in ('served','cancelled')))
   then raise exception 'สถานะเปลี่ยนไปแล้ว กรุณาโหลดใหม่' using errcode='PT409'; end if;
   if target='cancelled' and o.paid_at is not null and o.payment_status<>'refunded' then raise exception 'กรุณาคืนเงินก่อนยกเลิก' using errcode='PT400'; end if;
   update public.orders set fulfillment_status=target,updated_at=now() where id=p_id;
   insert into public.order_status_events(order_id,previous_status,next_status,actor_id,actor_name_snapshot) values(p_id,o.fulfillment_status,target,p_actor,actor_name);
  end if;
 elsif p_action='pay' then
  if p_value is null or p_value not in ('cash','promptpay') or o.fulfillment_status='cancelled' then raise exception 'รับชำระรายการนี้ไม่ได้' using errcode='PT400'; end if;
  if o.paid_at is null then
   insert into public.payment_transactions(order_id,kind,method,amount_satang,status,posted_at,idempotency_key,recorded_by) values(p_id,'capture',p_value,o.total_satang,'succeeded',now(),gen_random_uuid(),p_actor);
   update public.orders set payment_status='paid',paid_at=now(),updated_at=now() where id=p_id;
  end if;
 elsif p_action='refund' then
  if o.paid_at is null then raise exception 'ออเดอร์ยังไม่ชำระ' using errcode='PT400'; end if;
  if o.payment_status<>'refunded' then
   select * into capture from public.payment_transactions where order_id=p_id and kind='capture' and status='succeeded' order by posted_at limit 1;
   insert into public.payment_transactions(order_id,kind,method,amount_satang,status,posted_at,original_capture_id,idempotency_key,recorded_by) values(p_id,'refund',capture.method,o.total_satang,'succeeded',now(),capture.id,gen_random_uuid(),p_actor);
   update public.orders set payment_status='refunded',updated_at=now() where id=p_id;
  end if;
 else raise exception 'คำสั่งไม่ถูกต้อง' using errcode='PT400'; end if;
 return public.order_json(p_id);
end $$;

create function public.close_table(p_actor uuid,p_number integer) returns jsonb language plpgsql set search_path='' as $$
declare visit uuid;
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor);
 select s.id into visit from public.table_sessions s join public.restaurant_tables t on t.id=s.table_id where t.table_number=p_number and s.closed_at is null;
 if visit is null then return jsonb_build_object('ok',true); end if;
 if exists(select 1 from public.orders where table_session_id=visit and (fulfillment_status not in ('served','cancelled') or (fulfillment_status<>'cancelled' and paid_at is null)))
 then raise exception 'กรุณาส่งมอบและเคลียร์การชำระเงินก่อนปิดโต๊ะ' using errcode='PT400'; end if;
 update public.customer_sessions set revoked_at=now() where table_session_id=visit and revoked_at is null;
 update public.table_sessions set closed_at=now() where id=visit;
 return jsonb_build_object('ok',true);
end $$;

create function public.edit_menu(p_actor uuid,p_code text,p_prices jsonb,p_available boolean)
returns jsonb language plpgsql set search_path='' as $$
declare m uuid; v record; price bigint;
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor,true);
 select id into m from public.menu_items where code=p_code;
 if m is null or p_available is null then raise exception 'เมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 for v in select * from public.menu_variants where menu_item_id=m and is_active loop
  if (p_prices->>v.code) is null or (p_prices->>v.code) !~ '^[0-9]+$' then raise exception 'ราคาไม่ถูกต้อง' using errcode='PT400'; end if;
  price:=(p_prices->>v.code)::bigint;
  if price<1 or price>100000 then raise exception 'ราคาไม่ถูกต้อง' using errcode='PT400'; end if;
  update public.menu_variants set price_satang=price where id=v.id;
 end loop;
 update public.menu_items set is_sold_out=not p_available where id=m;
 return jsonb_build_object('ok',true);
end $$;

create function public.import_delivery_summary(p_actor uuid,p_rows jsonb,p_hash text,p_key uuid)
returns jsonb language plpgsql set search_path='' as $$
declare r jsonb; ch public.order_channel; d date; gross bigint; disc bigint; ref bigint; n integer; batch uuid; applied boolean; old_hash text; old_actor uuid;
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor,true);
 if p_key is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'รายการนำเข้าไม่ถูกต้อง' using errcode='PT400'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'channel',x->>'date' having count(*)>1) then raise exception 'วันและช่องทางซ้ำในไฟล์' using errcode='PT400'; end if;
 for ch in select distinct (x->>'channel')::public.order_channel from jsonb_array_elements(p_rows) x loop
  if ch is null or ch not in ('grabfood','lineman') then raise exception 'ช่องทางไม่ถูกต้อง' using errcode='PT400'; end if;
  select id,status='applied',content_hash,imported_by into batch,applied,old_hash,old_actor from public.delivery_import_batches where channel=ch and idempotency_key=p_key;
  if batch is not null and (old_hash<>p_hash or old_actor is distinct from p_actor) then raise exception 'รหัสนำเข้านี้ใช้กับข้อมูลอื่นแล้ว' using errcode='PT409'; end if;
  if coalesce(applied,false) then continue; end if;
  insert into public.delivery_import_batches(channel,input_mode,source,content_hash,imported_by,idempotency_key) values(ch,'daily_summary','manual',p_hash,p_actor,p_key) returning id into batch;
  for r in select x from jsonb_array_elements(p_rows) x where x->>'channel'=ch::text loop
   if r->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'วันที่ไม่ถูกต้อง' using errcode='PT400'; end if;
   d:=(r->>'date')::date; gross:=(r->>'grossSatang')::bigint; disc:=(r->>'discountSatang')::bigint; ref:=(r->>'refundSatang')::bigint; n:=(r->>'orderCount')::integer;
   if d is null or gross is null or disc is null or ref is null or gross not between 0 and 100000000 or disc not between 0 and gross or ref not between 0 and 100000000 or (n is not null and n not between 0 and 10000)
   then raise exception 'ยอดเงินหรือจำนวนออเดอร์ไม่ถูกต้อง' using errcode='PT400'; end if;
   insert into public.delivery_day_coverage(channel,sales_date,reporting_mode,is_complete) values(ch,d,'daily_summary',true)
   on conflict(channel,sales_date) do update set reporting_mode='daily_summary',is_complete=true,updated_at=now();
   insert into public.delivery_daily_sales(channel,sales_date,import_batch_id,gross_satang,discount_satang,refund_satang,paid_order_count) values(ch,d,batch,gross,disc,ref,n)
   on conflict(channel,sales_date) do update set import_batch_id=batch,gross_satang=gross,discount_satang=disc,refund_satang=ref,paid_order_count=n;
  end loop;
  update public.delivery_import_batches set status='applied' where id=batch;
 end loop;
 return jsonb_build_object('ok',true);
end $$;

create function public.rotate_qr(p_actor uuid,p_entries jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r jsonb; tab uuid;
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor,true);
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)<>9
 or (select count(distinct coalesce(x->>'tableNumber','takeaway')) from jsonb_array_elements(p_entries) x)<>9
 or (select count(*) from jsonb_array_elements(p_entries) x where x->>'tableNumber' is null)<>1
 then raise exception 'ต้องมี QR ทั้ง 9 จุด' using errcode='PT400'; end if;
 -- Keep identities referenced by historical sessions.
 for r in select value from jsonb_array_elements(p_entries) loop
  tab:=null;
  if r->>'tableNumber' is not null then
   select id into tab from public.restaurant_tables where table_number=(r->>'tableNumber')::integer;
   if tab is null then raise exception 'โต๊ะไม่ถูกต้อง' using errcode='PT400'; end if;
  end if;
  update public.qr_entrypoints set token_hash=r->>'hash',is_active=true where table_id is not distinct from tab;
  if not found then insert into public.qr_entrypoints(kind,table_id,token_hash) values(case when tab is null then 'takeaway' else 'dine_in' end,tab,r->>'hash'); end if;
 end loop;
 return jsonb_build_object('ok',true);
end $$;

-- Report executes as the signed-in user; source views retain RLS.
create function public.staff_sales_report(p_from date,p_to date) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if not public.is_staff() then raise exception 'กรุณาเข้าสู่ระบบพนักงาน' using errcode='PT403'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>31 then raise exception 'ช่วงรายงานไม่ถูกต้อง' using errcode='PT400'; end if;
 with e as (select * from public.sales_events where sales_date>=p_from and sales_date<p_to),
 totals as (select coalesce(sum(gross_satang-discount_satang),0) gross,coalesce(sum(refund_satang),0) refund,
 case when count(*) filter(where paid_order_count is null)>0 then null else coalesce(sum(paid_order_count),0) end cnt,
 coalesce(sum(gross_satang-discount_satang) filter(where source_kind='order'),0) detail,
 coalesce(bool_or(source_kind='daily_summary'),false) summary from e),
 top_menus as (select i.menu_item_id,min(i.menu_name_snapshot) name,sum(i.quantity) quantity from e join public.order_items i on i.order_id=e.order_id where source_kind='order' group by i.menu_item_id order by sum(i.quantity) desc,i.menu_item_id limit 10)
 select jsonb_build_object('gross',t.gross,'refund',t.refund,'net',t.gross-t.refund,'count',t.cnt,'average',case when t.cnt>0 then t.gross/t.cnt else null end,
 'detailGross',t.detail,'hasDailySummary',t.summary,
 'channels',(select jsonb_agg(jsonb_build_object('channel',c.code,'name',c.name,'value',coalesce((select sum(gross_satang-discount_satang) from e where channel::text=c.code),0)) order by c.n)
 from (values(1,'dine_in','ทานที่ร้าน'),(2,'takeaway','กลับบ้าน'),(3,'grabfood','GrabFood'),(4,'lineman','LINE MAN')) c(n,code,name)),
 'hourly',(select jsonb_agg(jsonb_build_object('hour',lpad(h::text,2,'0')||':00','value',coalesce((select sum(gross_satang-discount_satang)/100.0 from e where source_kind='order' and sales_hour=h),0)) order by h) from generate_series(0,23) h),
 'top',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity) order by quantity desc),'[]') from top_menus)) into result from totals t;
 return result;
end $$;

-- No public EXECUTE default on privileged entry points.
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('require_actor','menu_catalog','order_json','valid_customer','customer_bootstrap','customer_orders','place_order','staff_order_action','close_table','edit_menu','import_delivery_summary','rotate_qr') loop
  execute format('revoke all on function %s from public,anon,authenticated',r.sig);
  execute format('grant execute on function %s to service_role',r.sig);
 end loop;
end $$;
revoke all on function public.staff_sales_report(date,date) from public,anon;
grant execute on function public.staff_sales_report(date,date) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='table_sessions')
 then alter publication supabase_realtime add table public.table_sessions; end if;
end $$;
commit;

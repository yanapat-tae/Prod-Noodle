-- Non-destructive extension: visits are dine-in bills; order snapshots/ledgers stay intact.
begin;
alter table public.payment_transactions drop constraint payment_transactions_method_check;
alter table public.payment_transactions add constraint payment_transactions_method_check
 check(method in ('cash','promptpay','card','delivery_platform','thai_chuay_thai'));
create table public.bill_payments (
 id uuid primary key, -- caller's idempotency key, one logical receipt
 table_session_id uuid unique references public.table_sessions(id),
 anchor_order_id uuid not null references public.orders(id),
 amount_satang bigint not null check(amount_satang>0),
 method text not null check(method in ('cash','promptpay','thai_chuay_thai')),
 status text not null check(status='succeeded'),
 posted_at timestamptz not null,
 recorded_by uuid not null references public.admins(auth_user_id),
 payload jsonb not null,
 result jsonb not null,
 check(jsonb_typeof(payload)='object')
);
create unique index bill_payment_takeaway_once on public.bill_payments(anchor_order_id) where table_session_id is null;
alter table public.bill_payments enable row level security;
revoke all on public.bill_payments from public,anon,authenticated;
grant all on public.bill_payments to service_role;
grant select on public.bill_payments to authenticated;
create policy staff_read on public.bill_payments for select to authenticated using((select public.is_staff()));
alter table public.payment_transactions add column bill_payment_id uuid references public.bill_payments(id);
create index payments_bill_idx on public.payment_transactions(bill_payment_id) where bill_payment_id is not null;

create function public.staff_pay_bill(p_actor uuid,p_order_id uuid,p_request_key uuid,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare anchor public.orders; receipt public.bill_payments; previous public.bill_payments; o public.orders;
 ids uuid[]; expected uuid[]; total bigint; method_value text; confirmed boolean; result_value jsonb; posted timestamptz:=now();
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor);
 if p_request_key is null then raise exception 'ไม่มีรหัสคำขอ' using errcode='PT400'; end if;
 perform public.menu_object(p_payload,array['method','confirmed','expectedOrderIds','expectedTotalSatang']);
 method_value:=public.menu_text(p_payload->'method',40); confirmed:=public.menu_boolean(p_payload->'confirmed');
 if method_value not in ('cash','promptpay','thai_chuay_thai') or not confirmed then
  raise exception 'กรุณายืนยันรับเงินหรือตรวจรายการโอนก่อนบันทึก' using errcode='PT400'; end if;
 perform public.menu_integer(p_payload->'expectedTotalSatang',1,9007199254740991);
 select array_agg(value::uuid order by value::uuid) into expected from jsonb_array_elements_text(public.menu_array(p_payload->'expectedOrderIds',1,1000));
 if cardinality(expected)<>(select count(distinct x) from unnest(expected) x) then raise exception 'รายการออเดอร์ซ้ำ' using errcode='PT400'; end if;
 select * into previous from public.bill_payments where id=p_request_key;
 if found then
  if previous.recorded_by<>p_actor or previous.anchor_order_id<>p_order_id or previous.payload is distinct from p_payload then
   raise exception 'รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว' using errcode='PT409'; end if;
  return previous.result;
 end if;
 select * into anchor from public.orders where id=p_order_id for update;
 if anchor.id is null then raise exception 'ไม่พบออเดอร์' using errcode='PT404'; end if;
 select * into receipt from public.bill_payments where
  (anchor.table_session_id is not null and table_session_id=anchor.table_session_id) or
  (anchor.table_session_id is null and anchor_order_id=anchor.id);
 if found then
  -- Concurrent devices with the same reviewed bill get the original receipt; never recapture.
  if receipt.method<>method_value or receipt.amount_satang<>(p_payload->>'expectedTotalSatang')::bigint
   or expected is distinct from (select array_agg(value::uuid order by value::uuid) from jsonb_array_elements_text(receipt.payload->'expectedOrderIds')) then
   raise exception 'บิลชำระแล้ว กรุณาโหลดรายละเอียดล่าสุด' using errcode='PT409'; end if;
  return receipt.result;
 end if;
 if anchor.table_session_id is not null and not exists(select 1 from public.table_sessions where id=anchor.table_session_id and closed_at is null) then
  raise exception 'บิลปิดแล้ว กรุณาโหลดใหม่' using errcode='PT409'; end if;
 -- Lock is shared with place_order, cancellation, refund and close_table.
 select array_agg(id order by id),coalesce(sum(total_satang),0) into ids,total from public.orders
 where (case when anchor.table_session_id is null then id=anchor.id else table_session_id=anchor.table_session_id end)
  and fulfillment_status<>'cancelled' and paid_at is null;
 if ids is distinct from expected or total<>(p_payload->>'expectedTotalSatang')::bigint then
  raise exception 'รายการหรือยอดบิลเปลี่ยน กรุณาโหลดบิลล่าสุดก่อนรับเงิน' using errcode='PT409'; end if;
 if exists(select 1 from public.orders where id=any(ids) and payment_status<>'unpaid')
  or exists(select 1 from public.payment_transactions where order_id=any(ids) and kind='capture' and status in ('pending','succeeded')) then
  raise exception 'สถานะการชำระไม่ตรง กรุณาตรวจบิลก่อนรับเงิน' using errcode='PT409'; end if;
 insert into public.bill_payments(id,table_session_id,anchor_order_id,amount_satang,method,status,posted_at,recorded_by,payload,result)
 values(p_request_key,anchor.table_session_id,anchor.id,total,method_value,'succeeded',posted,p_actor,p_payload,'{}');
 for o in select * from public.orders where id=any(ids) order by id for update loop
  insert into public.payment_transactions(order_id,kind,method,amount_satang,status,posted_at,idempotency_key,recorded_by,bill_payment_id)
  values(o.id,'capture',method_value,o.total_satang,'succeeded',posted,gen_random_uuid(),p_actor,p_request_key);
  update public.orders set payment_status='paid',paid_at=posted,updated_at=posted where id=o.id;
 end loop;
 if anchor.table_session_id is not null then
  update public.customer_sessions set revoked_at=posted where table_session_id=anchor.table_session_id and revoked_at is null;
  update public.table_sessions set closed_at=posted where id=anchor.table_session_id and closed_at is null;
 end if;
 result_value:=jsonb_build_object('id',p_request_key,'billId',coalesce(anchor.table_session_id,anchor.id),'totalSatang',total,'method',method_value,'paidAt',posted,
  'orders',(select jsonb_agg(public.order_json(id) order by created_at,id) from public.orders where id=any(ids)));
 update public.bill_payments set result=result_value where id=p_request_key;
 return result_value;
end $$;
revoke all on function public.staff_pay_bill(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.staff_pay_bill(uuid,uuid,uuid,jsonb) to service_role;
with ranked as (
 select m.id,row_number() over(order by c.sort_order,m.sort_order,m.created_at,m.code)-1 n
 from public.menu_items m join public.menu_categories c on c.id=m.category_id
) update public.menu_items m set sort_order=r.n from ranked r where m.id=r.id;
create or replace function public.menu_catalog_items(p_archived boolean) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(data order by item_order,category_order,created_at,code),'[]') from (
 select c.sort_order category_order,m.sort_order item_order,m.created_at,m.code,jsonb_build_object(
 'code',m.code,'name',m.name,'category',c.code,'categoryName',c.name,'description',coalesce(m.description,''),
 'unit',m.unit,'available',not m.is_sold_out,'archived',not m.is_active,'revision',m.revision,
 'sortOrder',m.sort_order,'categorySortOrder',c.sort_order,'copy',m.customer_copy,'prepNotes',to_jsonb(m.prep_notes),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'name',v.name,'priceSatang',v.price_satang) order by v.sort_order,v.code),'[]') from public.menu_variants v where v.menu_item_id=m.id and v.is_active),
 'groups',(select coalesce(jsonb_agg(jsonb_build_object('code',g.code,'name',coalesce(ig.name_override,g.name),
 'min',ig.min_selections,'max',ig.max_selections,'enabled',ig.is_active,'limitsByVariant',ig.limits_by_variant,
 'options',(select coalesce(jsonb_agg(jsonb_build_object('code',o.code,'name',coalesce(io.name_override,o.name),
 'priceSatang',coalesce(io.price_override_satang,o.price_delta_satang),'defaultQuantity',io.default_quantity,'enabled',io.is_active and o.is_active)
 order by io.sort_order,o.code),'[]') from public.menu_item_options io join public.menu_options o on o.id=io.option_id
 where io.menu_item_id=m.id and io.group_id=g.id and (p_archived or (io.is_active and o.is_active)))) order by ig.sort_order,g.code),'[]')
 from public.menu_item_option_groups ig join public.option_groups g on g.id=ig.group_id where ig.menu_item_id=m.id and (p_archived or ig.is_active))) data
 from public.menu_items m join public.menu_categories c on c.id=m.category_id where c.is_active and (p_archived or m.is_active)
 ) catalog;
$$;
create or replace function public.menu_catalog() returns jsonb language sql stable set search_path='' as $$ select public.menu_catalog_items(false); $$;
create or replace function public.owner_menu_catalog(p_actor uuid) returns jsonb language plpgsql stable set search_path='' as $$
begin
 perform public.require_actor(p_actor,true);
 return jsonb_build_object('items',public.menu_catalog_items(true),'categories',
 (select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by sort_order,code),'[]') from public.menu_categories where is_active));
end $$;

create or replace function public.owner_manage_menu(p_actor uuid,p_request_key uuid,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare old_request public.owner_menu_requests; old public.menu_items; d jsonb; v jsonb; g jsonb; o jsonb; entry jsonb;
 kind text; menu_id uuid; category_id_value uuid; group_id_value uuid; option_id_value uuid; expected bigint; item_code text; n integer; ord integer; c text; positions integer[];
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor,true);
 if p_request_key is null then raise exception 'ไม่มีรหัสคำขอ' using errcode='PT400'; end if;
 select * into old_request from public.owner_menu_requests where request_key=p_request_key;
 if found then
  if old_request.actor_id<>p_actor or old_request.payload is distinct from p_payload then raise exception 'รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว' using errcode='PT409'; end if;
  return old_request.result;
 end if;
 perform public.menu_object(p_payload,array['kind','menu','expectedRevision','code','category','entries']); kind:=p_payload->>'kind';
 if kind='save' then
  perform public.menu_object(p_payload,array['kind','menu','expectedRevision']); d:=public.validate_menu_definition(p_payload->'menu');
  expected:=public.menu_integer(p_payload->'expectedRevision',0,9007199254740991); item_code:=d->>'code';
  select * into old from public.menu_items where code=item_code;
  if expected<>coalesce(old.revision,0) then raise exception 'เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก' using errcode='PT409'; end if;
  select id into category_id_value from public.menu_categories where code=d->>'category' and is_active;
  if old.id is null or old.category_id<>category_id_value then select coalesce(max(sort_order),-1)+1 into ord from public.menu_items ; else ord:=old.sort_order; end if;
  if old.id is null then
   insert into public.menu_items(code,name,category_id,description,unit,is_sold_out,customer_copy,prep_notes,sort_order)
   values(item_code,d->>'name',category_id_value,d->>'description',d->>'unit',not(d->>'available')::boolean,d->'copy',array(select jsonb_array_elements_text(d->'prepNotes')),ord) returning id into menu_id;
  else
   menu_id:=old.id;
   update public.menu_items set name=d->>'name',category_id=category_id_value,description=d->>'description',unit=d->>'unit',
    is_sold_out=not(d->>'available')::boolean,customer_copy=d->'copy',prep_notes=array(select jsonb_array_elements_text(d->'prepNotes')),sort_order=ord where id=menu_id;
  end if;
  -- Keep inactive variants and global options referenced by historical order rows.
  update public.menu_variants set is_active=false,is_default=false where menu_item_id=menu_id;
  n:=0; for v in select value from jsonb_array_elements(d->'variants') loop
   insert into public.menu_variants(menu_item_id,code,name,price_satang,is_default,is_active,sort_order)
   values(menu_id,v->>'code',v->>'name',(v->>'priceSatang')::bigint,n=0,true,n)
   on conflict(menu_item_id,code) do update set name=excluded.name,price_satang=excluded.price_satang,is_default=excluded.is_default,is_active=true,sort_order=excluded.sort_order;
   n:=n+1;
  end loop;
  delete from public.menu_item_options where menu_item_id=menu_id;
  delete from public.menu_item_option_groups where menu_item_id=menu_id;
  n:=0; for g in select value from jsonb_array_elements(d->'groups') loop
   insert into public.option_groups(code,name) values(g->>'code',g->>'name') on conflict(code) do nothing;
   select id into group_id_value from public.option_groups where code=g->>'code';
   insert into public.menu_item_option_groups(menu_item_id,group_id,min_selections,max_selections,name_override,sort_order,is_active,limits_by_variant)
   values(menu_id,group_id_value,(g->>'min')::smallint,(g->>'max')::smallint,g->>'name',n,(g->>'enabled')::boolean,g->'limitsByVariant');
   ord:=0; for o in select value from jsonb_array_elements(g->'options') loop
    insert into public.menu_options(group_id,code,name,price_delta_satang) values(group_id_value,o->>'code',o->>'name',(o->>'priceSatang')::bigint) on conflict(group_id,code) do nothing;
    select id into option_id_value from public.menu_options where group_id=group_id_value and code=o->>'code';
    if (o->>'enabled')::boolean and not (select is_active from public.menu_options where id=option_id_value) then raise exception 'ตัวเลือกนี้ปิดใช้งานแล้ว กรุณาสร้างตัวเลือกใหม่' using errcode='PT400'; end if;
    insert into public.menu_item_options(menu_item_id,group_id,option_id,price_override_satang,default_quantity,name_override,sort_order,is_active)
    values(menu_id,group_id_value,option_id_value,(o->>'priceSatang')::bigint,(o->>'defaultQuantity')::smallint,o->>'name',ord,(o->>'enabled')::boolean);
    ord:=ord+1;
   end loop; n:=n+1;
  end loop;
 elsif kind in ('archive','restore') then
  perform public.menu_object(p_payload,array['kind','code','expectedRevision']); item_code:=public.menu_code(p_payload->'code');
  expected:=public.menu_integer(p_payload->'expectedRevision',1,9007199254740991);
  select * into old from public.menu_items where code=item_code;
  if old.id is null or expected<>old.revision then raise exception 'เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก' using errcode='PT409'; end if;
  update public.menu_items set is_active=kind='restore' where id=old.id;
 elsif kind='reorder' then
  perform public.menu_object(p_payload,array['kind','category','entries']); c:=public.menu_code(p_payload->'category');
  select id into category_id_value from public.menu_categories where code=c and is_active;
  if c<>'all' and category_id_value is null then raise exception 'ไม่พบหมวดหมู่เมนู' using errcode='PT400'; end if;
  d:=public.menu_array(p_payload->'entries',0,1000);
  for entry in select value from jsonb_array_elements(d) loop
   perform public.menu_object(entry,array['code','revision']); perform public.menu_code(entry->'code'); perform public.menu_integer(entry->'revision',1,9007199254740991);
  end loop;
  if exists(select 1 from jsonb_array_elements(d) e group by e->>'code' having count(*)>1) then raise exception 'รหัสเมนูซ้ำ' using errcode='PT400'; end if;
  if jsonb_array_length(d)<>(select count(*) from public.menu_items where (c='all' or category_id=category_id_value) and is_active)
   or exists(select 1 from public.menu_items m where (c='all' or m.category_id=category_id_value) and m.is_active and not exists(select 1 from jsonb_array_elements(d) e where e->>'code'=m.code and (e->>'revision')::bigint=m.revision))
   then raise exception 'เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนจัดลำดับ' using errcode='PT409'; end if;
  select array_agg(sort_order order by sort_order,created_at,code) into positions from public.menu_items where is_active and (c='all' or category_id=category_id_value);
  n:=1; for entry in select value from jsonb_array_elements(d) loop update public.menu_items set sort_order=positions[n] where code=entry->>'code'; n:=n+1; end loop;
 else raise exception 'คำสั่งจัดการเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 insert into public.owner_menu_requests(request_key,actor_id,payload,result) values(p_request_key,p_actor,p_payload,'{"ok":true}');
 return '{"ok":true}'::jsonb;
end $$;

create or replace function public.place_order(p_payload jsonb,p_key uuid,p_hash text,p_customer_hash text default null,p_actor uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare c public.customer_sessions; e public.qr_entrypoints; old public.orders; ch public.order_channel;
 tab uuid; visit uuid; num integer; actor_name text; oid uuid:=gen_random_uuid(); iid uuid;
 line jsonb; opt jsonb; m public.menu_items; v public.menu_variants; quantity integer; extra bigint; total bigint:=0;
 details jsonb; customer_name text; delivery_address text; delivery_phone text; village boolean; free_note_value text;
 grp record; chosen record; line_count integer; note text; notes text; date_today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 perform pg_advisory_xact_lock(814208);
 if p_actor is not null then actor_name:=public.require_actor(p_actor); else select * into c from public.customer_sessions where token_hash=p_customer_hash; actor_name:='ลูกค้า'; end if;
 select * into old from public.orders where idempotency_key=p_key;
 if old.id is not null then
  if old.request_hash<>p_hash or old.created_by is distinct from p_actor or old.customer_session_id is distinct from c.id
  then raise exception 'รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว' using errcode='PT409'; end if;
  return public.order_json(old.id);
 end if;
 if p_actor is null then c:=public.valid_customer(p_customer_hash); end if;
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
  for grp in select g.code,coalesce((ig.limits_by_variant->v.code->>'min')::integer,ig.min_selections) min_selections,coalesce((ig.limits_by_variant->v.code->>'max')::integer,ig.max_selections) max_selections from public.menu_item_option_groups ig join public.option_groups g on g.id=ig.group_id where ig.menu_item_id=m.id and ig.is_active loop
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
   select o.id,coalesce(io.name_override,o.name) name,coalesce(ig.name_override,g.name) group_name,coalesce(io.price_override_satang,o.price_delta_satang) price into chosen
   from public.menu_item_options io join public.menu_options o on o.id=io.option_id join public.option_groups g on g.id=io.group_id
   join public.menu_item_option_groups ig on ig.menu_item_id=io.menu_item_id and ig.group_id=io.group_id
   where io.menu_item_id=m.id and g.code=opt->>'groupCode' and o.code=opt->>'optionCode' and o.is_active and io.is_active and ig.is_active;
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

create or replace function public.order_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('id',o.id,'channel',o.channel,'tableNumber',t.table_number,'queueNumber',o.queue_number,
 'takeaway',o.takeaway_details,'billPaymentId',(select p.bill_payment_id from public.payment_transactions p where p.order_id=o.id and p.kind='capture' and p.status='succeeded' order by p.posted_at limit 1),
 'visitId',o.table_session_id,'status',o.fulfillment_status,'totalSatang',o.total_satang,'createdAt',o.created_at,'paidAt',o.paid_at,
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

create or replace function public.staff_sales_report(p_from date,p_to date) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if not public.is_staff() then raise exception 'กรุณาเข้าสู่ระบบพนักงาน' using errcode='PT403'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>31 then raise exception 'ช่วงรายงานไม่ถูกต้อง' using errcode='PT400'; end if;
 with e as (select * from public.sales_events where sales_date>=p_from and sales_date<p_to),
 totals as (select coalesce(sum(gross_satang-discount_satang),0) gross,coalesce(sum(refund_satang),0) refund,
 case when count(*) filter(where paid_order_count is null)>0 then null else coalesce(sum(paid_order_count),0) end cnt,
 coalesce(sum(gross_satang-discount_satang) filter(where source_kind='order'),0) detail,
 coalesce(bool_or(source_kind='daily_summary'),false) summary from e),
 top_menus as (select i.menu_item_id,min(i.menu_name_snapshot) name,sum(i.quantity) quantity from e join public.order_items i on i.order_id=e.order_id where source_kind='order' and not exists(select 1 from public.menu_items m where m.id=i.menu_item_id and m.code in ('ice','water','soft-drink','longan-juice','butterfly-pea-lime','chrysanthemum-tea')) group by i.menu_item_id order by sum(i.quantity) desc,i.menu_item_id limit 10)
 select jsonb_build_object('gross',t.gross,'refund',t.refund,'net',t.gross-t.refund,'count',t.cnt,'average',case when t.cnt>0 then t.gross/t.cnt else null end,
 'detailGross',t.detail,'hasDailySummary',t.summary,
 'channels',(select jsonb_agg(jsonb_build_object('channel',c.code,'name',c.name,'value',coalesce((select sum(gross_satang-discount_satang) from e where channel::text=c.code),0)) order by c.n)
 from (values(1,'dine_in','ทานที่ร้าน'),(2,'takeaway','กลับบ้าน'),(3,'grabfood','GrabFood'),(4,'lineman','LINE MAN')) c(n,code,name)),
 'hourly',(select jsonb_agg(jsonb_build_object('hour',lpad(h::text,2,'0')||':00','value',coalesce((select sum(gross_satang-discount_satang)/100.0 from e where source_kind='order' and sales_hour=h),0)) order by h) from generate_series(0,23) h),
 'payments',(select jsonb_agg(jsonb_build_object('method',v.method,'name',v.name,'value',coalesce((select sum(p.amount_satang) from public.payment_transactions p where p.kind='capture' and p.status='succeeded' and (p.posted_at at time zone 'Asia/Bangkok')::date>=p_from and (p.posted_at at time zone 'Asia/Bangkok')::date<p_to and p.method=v.method),0)) order by v.n) from (values(1,'cash','เงินสด'),(2,'promptpay','PromptPay'),(3,'card','บัตร'),(4,'delivery_platform','แพลตฟอร์ม Delivery'),(5,'thai_chuay_thai','สแกนไทยช่วยไทย')) v(n,method,name)),
 'top',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity) order by quantity desc),'[]') from top_menus)) into result from totals t;
 return result;
end $$;

create or replace function public.staff_order_action(p_actor uuid,p_id uuid,p_action text,p_value text default null)
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
   if not ((o.fulfillment_status='new' and target in ('preparing','served','cancelled')) or (o.fulfillment_status='preparing' and target in ('ready','served','cancelled')) or (o.fulfillment_status='ready' and target in ('served','cancelled')))
   then raise exception 'สถานะเปลี่ยนไปแล้ว กรุณาโหลดใหม่' using errcode='PT409'; end if;
   if target='cancelled' and o.paid_at is not null and o.payment_status<>'refunded' then raise exception 'กรุณาคืนเงินก่อนยกเลิก' using errcode='PT400'; end if;
   update public.orders set fulfillment_status=target,updated_at=now() where id=p_id;
   insert into public.order_status_events(order_id,previous_status,next_status,actor_id,actor_name_snapshot) values(p_id,o.fulfillment_status,target,p_actor,actor_name);
  end if;
 elsif p_action='pay' then
  if o.table_session_id is not null then raise exception 'กรุณาโหลดหน้ารับเงินใหม่เพื่อชำระบิลรวมทุกออเดอร์' using errcode='PT409'; end if;
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

revoke all on function public.staff_order_action(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.staff_order_action(uuid,uuid,text,text) to service_role;
create function public.menu_categories_json() returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by sort_order,code),'[]') from public.menu_categories where is_active;
$$;
revoke all on function public.menu_categories_json() from public,anon,authenticated;
grant execute on function public.menu_categories_json() to service_role;
-- Closing a bill forbids new writes with its session, while its customer can still
-- read their own paid receipt until expiry. Other customers' rounds stay private.
create or replace function public.customer_orders(p_hash text) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.customer_sessions;
begin
 select * into c from public.customer_sessions where token_hash=p_hash and expires_at>now();
 if c.id is null or (c.revoked_at is not null and not exists(select 1 from public.table_sessions where id=c.table_session_id and closed_at is not null)) then
  raise exception 'รอบโต๊ะหมดอายุ กรุณาสแกน QR ใหม่' using errcode='PT401'; end if;
 return (select coalesce(jsonb_agg(public.order_json(id) order by created_at,id),'[]') from public.orders where customer_session_id=c.id);
end $$;
commit;

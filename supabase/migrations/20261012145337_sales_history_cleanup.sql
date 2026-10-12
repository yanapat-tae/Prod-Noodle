-- Owner-only exclusion of accidental/test sales. Bills, snapshots and the ledger
-- remain available for audit; deleting a test sale never records a real refund.
begin;
select pg_advisory_xact_lock(814208);
alter table public.orders add column sales_deleted_at timestamptz;
alter table public.delivery_daily_sales add column sales_deleted_at timestamptz;
create table public.sales_deletions (
 id uuid primary key,
 actor_id uuid not null references public.admins(auth_user_id),
 actor_name_snapshot text not null,
 reason text not null check(length(trim(reason)) between 1 and 500),
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.sales_deletions enable row level security;
revoke all on public.sales_deletions from public,anon,authenticated;
grant all on public.sales_deletions to service_role;

create function public.owner_sales_history(p_actor uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 perform public.require_actor(p_actor,true);
 if (select count(*) from public.orders where sales_deleted_at is null)+(select count(*) from public.delivery_daily_sales where sales_deleted_at is null)>1000 then
  raise exception 'ประวัติเกิน 1,000 รายการ กรุณาติดต่อผู้ดูแลเพื่อแบ่งช่วงข้อมูล' using errcode='PT409'; end if;
 select jsonb_build_object('records',coalesce(jsonb_agg(record order by at desc,id),'[]')) into result from (
 select o.created_at at,o.id::text id,jsonb_build_object('kind','order','id',o.id,'version',md5(to_jsonb(o)::text),
 'label',case when o.channel='dine_in' then 'โต๊ะ '||t.table_number when o.channel='takeaway' then 'กลับบ้าน · T-'||o.queue_number else o.channel::text end,
 'date',o.created_at,'totalSatang',o.total_satang,'paid',o.paid_at is not null,
 'detail',coalesce((select string_agg(i.menu_name_snapshot||' × '||i.quantity,', ' order by i.id) from public.order_items i where i.order_id=o.id),'')) record
 from public.orders o left join public.restaurant_tables t on t.id=o.table_id where o.sales_deleted_at is null
 union all
 select s.sales_date::timestamp at,s.channel::text||':'||s.sales_date::text id,
 jsonb_build_object('kind','summary','id',s.channel::text||':'||s.sales_date::text,'version',md5(to_jsonb(s)::text),
 'label',case when s.channel='grabfood' then 'GrabFood' else 'LINE MAN' end||' · สรุปรายวัน',
 'date',s.sales_date::text||'T00:00:00+07:00','totalSatang',s.gross_satang-s.discount_satang,'paid',true,'detail','ยอดรวมรายวัน')
 from public.delivery_daily_sales s where s.sales_deleted_at is null
 ) rows;
 return result;
end $$;

create function public.owner_delete_sales(p_actor uuid,p_request_key uuid,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare actor_name text; old public.sales_deletions; r jsonb; version_value text; reason_value text; result_value jsonb; visits uuid[];
begin
 perform pg_advisory_xact_lock(814208);
 actor_name:=public.require_actor(p_actor,true);
 if p_request_key is null then raise exception 'ไม่มีรหัสคำขอ' using errcode='PT400'; end if;
 perform public.menu_object(p_payload,array['records','reason']);
 reason_value:=public.menu_text(p_payload->'reason',500);
 if trim(reason_value)='' then raise exception 'กรุณาระบุเหตุผลการลบ' using errcode='PT400'; end if;
 perform public.menu_array(p_payload->'records',1,1000);
 select * into old from public.sales_deletions where id=p_request_key;
 if found then
  if old.actor_id<>p_actor or old.payload is distinct from p_payload then raise exception 'รหัสอ้างอิงนี้ใช้กับคำขออื่นแล้ว' using errcode='PT409'; end if;
  return old.result;
 end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'records') x group by x->>'kind',x->>'id' having count(*)>1) then
  raise exception 'รายการลบซ้ำ' using errcode='PT400'; end if;
 for r in select value from jsonb_array_elements(p_payload->'records') loop
  perform public.menu_object(r,array['kind','id','version']);
  perform public.menu_text(r->'id',80); perform public.menu_text(r->'version',32);
  version_value:=null;
  if r->>'kind'='order' then
   select md5(to_jsonb(o)::text) into version_value from public.orders o where o.id=(r->>'id')::uuid and o.sales_deleted_at is null for update;
  elsif r->>'kind'='summary' then
   select md5(to_jsonb(s)::text) into version_value from public.delivery_daily_sales s where s.channel::text||':'||s.sales_date::text=r->>'id' and s.sales_deleted_at is null for update;
  else raise exception 'รายการลบไม่ถูกต้อง' using errcode='PT400'; end if;
  if version_value is null or version_value<>r->>'version' then raise exception 'รายการเปลี่ยนไปแล้ว กรุณาโหลดประวัติใหม่ก่อนลบ' using errcode='PT409'; end if;
 end loop;
 select array_agg(distinct o.table_session_id) into visits from public.orders o join jsonb_array_elements(p_payload->'records') selected_row on selected_row->>'kind'='order' and o.id::text=selected_row->>'id';
 update public.orders o set sales_deleted_at=now(),updated_at=now() where exists(select 1 from jsonb_array_elements(p_payload->'records') selected_row where selected_row->>'kind'='order' and selected_row->>'id'=o.id::text);
 update public.delivery_daily_sales s set sales_deleted_at=now() where exists(select 1 from jsonb_array_elements(p_payload->'records') selected_row where selected_row->>'kind'='summary' and selected_row->>'id'=s.channel::text||':'||s.sales_date::text);
 -- Close only reviewed visits which have no remaining real order.
 update public.table_sessions t set closed_at=now() where t.id=any(visits) and t.closed_at is null and not exists(select 1 from public.orders o where o.table_session_id=t.id and o.sales_deleted_at is null);
 update public.customer_sessions c set revoked_at=now() where c.table_session_id=any(visits) and c.revoked_at is null and exists(select 1 from public.table_sessions t where t.id=c.table_session_id and t.closed_at is not null);
 result_value:=jsonb_build_object('ok',true,'count',jsonb_array_length(p_payload->'records'));
 insert into public.sales_deletions(id,actor_id,actor_name_snapshot,reason,payload,result) values(p_request_key,p_actor,actor_name,trim(reason_value),p_payload,result_value);
 return result_value;
end $$;
revoke all on function public.owner_sales_history(uuid),public.owner_delete_sales(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.owner_sales_history(uuid),public.owner_delete_sales(uuid,uuid,jsonb) to service_role;

create or replace view public.sales_events with (security_invoker = true) as
select 'order'::text as source_kind, o.id::text as source_id,
  o.id as order_id, null::uuid as refund_transaction_id,
  (o.paid_at at time zone 'Asia/Bangkok')::date as sales_date,
  extract(hour from o.paid_at at time zone 'Asia/Bangkok')::integer as sales_hour,
  o.channel, o.gross_satang, o.discount_satang, 0::bigint as refund_satang,
  o.total_satang as net_sales_satang, 1::bigint as paid_order_count,
  o.items_complete as has_menu_detail
from public.orders o
where o.sales_deleted_at is null and o.paid_at is not null and (
  o.channel in ('dine_in', 'takeaway') or exists (
    select 1 from public.delivery_day_coverage c where c.channel = o.channel
    and c.sales_date = (o.paid_at at time zone 'Asia/Bangkok')::date
    and c.reporting_mode = 'order_detail'
  )
)
union all
select 'refund', p.id::text, o.id, p.id, (p.posted_at at time zone 'Asia/Bangkok')::date,
  extract(hour from p.posted_at at time zone 'Asia/Bangkok')::integer,
  o.channel, 0::bigint, 0::bigint, p.amount_satang, -p.amount_satang, 0::bigint, false
from public.payment_transactions p join public.orders o on o.id = p.order_id
where o.sales_deleted_at is null and p.kind = 'refund' and p.status = 'succeeded' and o.paid_at is not null and (
  o.channel in ('dine_in', 'takeaway') or exists (
    select 1 from public.delivery_day_coverage c where c.channel = o.channel
    and c.sales_date = (p.posted_at at time zone 'Asia/Bangkok')::date
    and c.reporting_mode = 'order_detail'
  )
)
union all
select 'daily_summary', s.channel::text || ':' || s.sales_date::text, null::uuid, null::uuid,
  s.sales_date, null::integer, s.channel, s.gross_satang, s.discount_satang,
  s.refund_satang, s.net_sales_satang, s.paid_order_count::bigint, false
from public.delivery_daily_sales s join public.delivery_day_coverage c
  on c.channel = s.channel and c.sales_date = s.sales_date
where s.sales_deleted_at is null and c.reporting_mode = 'daily_summary';

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
 'payments',(select jsonb_agg(jsonb_build_object('method',v.method,'name',v.name,'value',coalesce((select sum(p.amount_satang) from public.payment_transactions p join public.orders o on o.id=p.order_id where o.sales_deleted_at is null and p.kind='capture' and p.status='succeeded' and (p.posted_at at time zone 'Asia/Bangkok')::date>=p_from and (p.posted_at at time zone 'Asia/Bangkok')::date<p_to and p.method=v.method),0)) order by v.n) from (values(1,'cash','เงินสด'),(2,'promptpay','PromptPay'),(3,'card','บัตร'),(4,'delivery_platform','แพลตฟอร์ม Delivery'),(5,'thai_chuay_thai','สแกนไทยช่วยไทย')) v(n,method,name)),
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
 if o.sales_deleted_at is not null then raise exception 'รายการนี้ถูกลบจากยอดขายแล้ว' using errcode='PT409'; end if;
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

create or replace function public.staff_pay_bill(p_actor uuid,p_order_id uuid,p_request_key uuid,p_payload jsonb)
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
 if exists(select 1 from public.orders where (id=p_order_id or id=any(expected)) and sales_deleted_at is not null) then raise exception 'รายการนี้ถูกลบจากยอดขายแล้ว' using errcode='PT409'; end if;
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
  and sales_deleted_at is null and fulfillment_status<>'cancelled' and paid_at is null;
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

create or replace function public.close_table(p_actor uuid,p_number integer) returns jsonb language plpgsql set search_path='' as $$
declare visit uuid;
begin
 perform pg_advisory_xact_lock(814208); perform public.require_actor(p_actor);
 select s.id into visit from public.table_sessions s join public.restaurant_tables t on t.id=s.table_id where t.table_number=p_number and s.closed_at is null;
 if visit is null then return jsonb_build_object('ok',true); end if;
 if exists(select 1 from public.orders where table_session_id=visit and sales_deleted_at is null and (fulfillment_status not in ('served','cancelled') or (fulfillment_status<>'cancelled' and paid_at is null)))
 then raise exception 'กรุณาส่งมอบและเคลียร์การชำระเงินก่อนปิดโต๊ะ' using errcode='PT400'; end if;
 update public.customer_sessions set revoked_at=now() where table_session_id=visit and revoked_at is null;
 update public.table_sessions set closed_at=now() where id=visit;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.customer_orders(p_hash text) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.customer_sessions;
begin
 select * into c from public.customer_sessions where token_hash=p_hash and expires_at>now();
 if c.id is null or (c.revoked_at is not null and not exists(select 1 from public.table_sessions where id=c.table_session_id and closed_at is not null)) then
  raise exception 'รอบโต๊ะหมดอายุ กรุณาสแกน QR ใหม่' using errcode='PT401'; end if;
 return (select coalesce(jsonb_agg(public.order_json(id) order by created_at,id),'[]') from public.orders where customer_session_id=c.id and sales_deleted_at is null);
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
  if old.sales_deleted_at is not null then raise exception 'รายการทดลองนี้ถูกลบแล้ว กรุณาเริ่มออเดอร์ใหม่' using errcode='PT409'; end if;
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

create or replace function public.import_delivery_summary(p_actor uuid,p_rows jsonb,p_hash text,p_key uuid)
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
   on conflict(channel,sales_date) do update set sales_deleted_at=null,import_batch_id=batch,gross_satang=gross,discount_satang=disc,refund_satang=ref,paid_order_count=n;
  end loop;
  update public.delivery_import_batches set status='applied' where id=batch;
 end loop;
 return jsonb_build_object('ok',true);
end $$;
commit;

-- Allow kitchen completion without changing bills, payments, sessions or historical events.
-- Keep legacy intermediate transitions for existing clients.
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

-- A displayed QR is durable. Preserve every existing printed token hash.
alter table public.qr_entrypoints
  add column entry_key text,
  add column display_token text check (display_token ~ '^[0-9a-f]{64}$'),
  add column display_hash text check (display_hash ~ '^[0-9a-f]{64}$'),
  add column revision integer not null default 1 check (revision > 0),
  add column last_rotation_key uuid;
update public.qr_entrypoints e set entry_key='table-'||t.table_number
from public.restaurant_tables t where t.id=e.table_id;
update public.qr_entrypoints set entry_key='takeaway-front' where kind='takeaway';
drop index public.one_takeaway_entrypoint;
alter table public.qr_entrypoints add constraint qr_entry_key_unique unique(entry_key);
alter table public.qr_entrypoints add constraint qr_entry_key_valid check (
  (kind='dine_in' and entry_key ~ '^table-[1-8]$') or
  (kind='takeaway' and entry_key in ('takeaway-front','takeaway-remote'))
);

-- Store owner-readable display tokens once. Old hashes remain accepted as aliases
-- until that specific entry is deliberately rotated. Raw tokens stay server-only.
do $$
declare number integer; key text; tab uuid; fresh text; hashed text;
begin
 perform pg_advisory_xact_lock(814208);
 for number in 1..10 loop
  key:=case when number<=8 then 'table-'||number when number=9 then 'takeaway-front' else 'takeaway-remote' end;
  tab:=null;
  if number<=8 then
   select id into strict tab from public.restaurant_tables where table_number=number;
  end if;
  fresh:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  hashed:=encode(sha256(convert_to(fresh,'UTF8')),'hex');
  insert into public.qr_entrypoints(kind,table_id,entry_key,token_hash,display_token,display_hash)
  values(case when number<=8 then 'dine_in' else 'takeaway' end,tab,key,hashed,fresh,hashed)
  on conflict(entry_key) do update set display_token=excluded.display_token,display_hash=excluded.display_hash;
 end loop;
end $$;
alter table public.qr_entrypoints alter column entry_key set not null;
alter table public.qr_entrypoints alter column display_token set not null;
alter table public.qr_entrypoints alter column display_hash set not null;
create unique index qr_display_hash_unique on public.qr_entrypoints(display_hash);

-- This authenticated RPC is owner-only; callers cannot supply a different actor.
create function public.owner_qr_entries() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_actor(auth.uid(),true);
 select jsonb_agg(jsonb_build_object('key',e.entry_key,'token',e.display_token,'revision',e.revision,
  'label',case when t.table_number is not null then 'โต๊ะ '||t.table_number when e.entry_key='takeaway-front' then 'กลับบ้าน · หน้าร้าน' else 'กลับบ้าน · สั่งล่วงหน้า / LINE' end)
  order by coalesce(t.table_number,case when e.entry_key='takeaway-front' then 9 else 10 end))
 into result from public.qr_entrypoints e left join public.restaurant_tables t on t.id=e.table_id;
 return coalesce(result,'[]'::jsonb);
end $$;

create function public.owner_rotate_qr(p_entry_key text,p_expected_revision integer,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.qr_entrypoints; fresh text; hashed text; result jsonb;
begin
 perform public.require_actor(auth.uid(),true); perform pg_advisory_xact_lock(814208);
 if p_request_key is null then raise exception 'คำขอไม่มีรหัสอ้างอิง' using errcode='PT400'; end if;
 select * into e from public.qr_entrypoints where entry_key=p_entry_key for update;
 if e.id is null then raise exception 'ไม่พบจุดสั่งอาหาร' using errcode='PT400'; end if;
 if e.last_rotation_key is distinct from p_request_key then
  if p_expected_revision is distinct from e.revision then raise exception 'QR เปลี่ยนไปแล้ว กรุณาโหลดใหม่' using errcode='PT409'; end if;
  fresh:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  hashed:=encode(sha256(convert_to(fresh,'UTF8')),'hex');
  update public.qr_entrypoints set token_hash=hashed,display_token=fresh,display_hash=hashed,
    revision=revision+1,last_rotation_key=p_request_key,is_active=true where id=e.id;
 end if;
 select value into result from jsonb_array_elements(public.owner_qr_entries()) where value->>'key'=p_entry_key;
 return result;
end $$;
revoke all on function public.owner_qr_entries(), public.owner_rotate_qr(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.owner_qr_entries(), public.owner_rotate_qr(text,integer,uuid) to authenticated;

-- Stale frontends must never rotate the entire shop through the old endpoint.
create or replace function public.rotate_qr(p_actor uuid,p_entries jsonb)
returns jsonb language plpgsql set search_path='' as $$
begin
 perform public.require_actor(p_actor,true);
 raise exception 'กรุณารีเฟรชหน้า QR เพื่อใช้ QR ถาวรและเปลี่ยนเฉพาะใบ' using errcode='PT409';
end $$;

create or replace function public.customer_bootstrap(p_entry_hash text,p_new_hash text,p_old_hash text default null)
returns jsonb language plpgsql set search_path='' as $$
declare e public.qr_entrypoints; c public.customer_sessions; visit uuid; tab smallint; resumed boolean:=false;
begin
 perform pg_advisory_xact_lock(814208);
 select * into e from public.qr_entrypoints where (token_hash=p_entry_hash or display_hash=p_entry_hash) and is_active;
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


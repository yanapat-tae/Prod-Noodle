-- Full owner editing stores overrides on each menu link. Historical rows stay intact.
begin;
alter table public.menu_items add column sort_order integer not null default 0,
 add column customer_copy jsonb not null default '{}', add column revision bigint not null default 1;
alter table public.menu_variants add column sort_order integer not null default 0;
alter table public.menu_item_option_groups add column name_override text, add column sort_order integer not null default 0,
 add column is_active boolean not null default true, add column limits_by_variant jsonb not null default '{}';
alter table public.menu_item_options add column name_override text, add column sort_order integer not null default 0,
 add column is_active boolean not null default true;
-- Preserve the catalog's existing relative order before owners start moving entries.
with ranked as (select id,row_number() over(partition by category_id order by created_at,code)-1 n from public.menu_items)
 update public.menu_items m set sort_order=r.n from ranked r where r.id=m.id;
with ranked as (select id,row_number() over(partition by menu_item_id order by is_default desc,price_satang,code)-1 n from public.menu_variants)
 update public.menu_variants v set sort_order=r.n from ranked r where r.id=v.id;
update public.menu_item_option_groups ig set sort_order=case g.code when 'noodle' then 0 when 'broth' then 1 else 2 end from public.option_groups g where g.id=ig.group_id;
with ranked as (select io.menu_item_id,io.option_id,row_number() over(partition by io.menu_item_id,io.group_id order by o.code)-1 n from public.menu_item_options io join public.menu_options o on o.id=io.option_id)
 update public.menu_item_options io set sort_order=r.n from ranked r where r.menu_item_id=io.menu_item_id and r.option_id=io.option_id;
create function public.advance_menu_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1; return new; end $$;
create trigger menu_revision before update on public.menu_items for each row execute function public.advance_menu_revision();
create table public.owner_menu_requests (
 request_key uuid primary key, actor_id uuid not null references public.admins(auth_user_id),
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.owner_menu_requests enable row level security;
revoke all on public.owner_menu_requests from public,anon,authenticated;
grant all on public.owner_menu_requests to service_role;

create function public.menu_catalog_items(p_archived boolean) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(data order by category_order,item_order,created_at,code),'[]') from (
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
create function public.owner_menu_catalog(p_actor uuid) returns jsonb language plpgsql stable set search_path='' as $$
begin
 perform public.require_actor(p_actor,true);
 return jsonb_build_object('items',public.menu_catalog_items(true),'categories',
 (select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name) order by sort_order,code),'[]') from public.menu_categories where is_active));
end $$;

-- Small validation helpers keep the JSON contract explicit at the SQL boundary.
create function public.menu_object(p_value jsonb,p_keys text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'object' then raise exception 'ข้อมูลเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 if exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_keys))) then raise exception 'มีข้อมูลเมนูที่ไม่รองรับ' using errcode='PT400'; end if;
end $$;
create function public.menu_text(p_value jsonb,p_max integer,p_empty boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare t text;
begin
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'ข้อความเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 t:=public.app_trim(p_value #>> '{}');
 if char_length(t)>p_max or (not p_empty and t='') then raise exception 'กรุณาตรวจข้อความเมนูและความยาว' using errcode='PT400'; end if;
 return t;
end $$;
create function public.menu_code(p_value jsonb) returns text language plpgsql immutable set search_path='' as $$
declare t text:=public.menu_text(p_value,80);
begin if t !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'รหัสไม่ถูกต้อง' using errcode='PT400'; end if; return t; end $$;
create function public.menu_integer(p_value jsonb,p_min bigint,p_max bigint) returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(p_value) is distinct from 'number' then raise exception 'จำนวนหรือราคาไม่ถูกต้อง' using errcode='PT400'; end if;
 n:=(p_value #>> '{}')::numeric;
 if n<>trunc(n) or n<p_min or n>p_max then raise exception 'จำนวนหรือราคาไม่ถูกต้อง' using errcode='PT400'; end if;
 return n::bigint;
end $$;
create function public.menu_boolean(p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin if jsonb_typeof(p_value) is distinct from 'boolean' then raise exception 'สถานะเมนูไม่ถูกต้อง' using errcode='PT400'; end if; return (p_value #>> '{}')::boolean; end $$;
create function public.menu_array(p_value jsonb,p_min integer,p_max integer) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'array' then raise exception 'รายการเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 if jsonb_array_length(p_value) not between p_min and p_max then raise exception 'จำนวนรายการเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 return p_value;
end $$;
create function public.menu_limits(p_value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare lo integer; hi integer;
begin
 perform public.menu_object(p_value,array['min','max']); lo:=public.menu_integer(p_value->'min',0,20); hi:=public.menu_integer(p_value->'max',0,20);
 if lo>hi then raise exception 'จำนวนขั้นต่ำต้องไม่เกินจำนวนสูงสุด' using errcode='PT400'; end if;
 return jsonb_build_object('min',lo,'max',hi);
end $$;
create function public.validate_menu_definition(p_value jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare d jsonb; v jsonb; g jsonb; o jsonb; cp jsonb; bounds jsonb; normalized jsonb; variants jsonb:='[]'; groups jsonb:='[]'; options jsonb; notes jsonb:='[]';
 codes text[]:='{}'; group_codes text[]:='{}'; option_codes text[]; c text; k text; note text; enabled boolean; defaults integer; choices integer; required integer;
begin
 perform public.menu_object(p_value,array['code','name','category','description','unit','available','copy','variants','groups','prepNotes']);
 c:=public.menu_code(p_value->'category');
 if not exists(select 1 from public.menu_categories where code=c and is_active) then raise exception 'ไม่พบหมวดหมู่เมนู' using errcode='PT400'; end if;
 cp:=p_value->'copy'; perform public.menu_object(cp,array['variantLabel','instructions','notesLabel','notesPlaceholder']);
 cp:=jsonb_build_object('variantLabel',public.menu_text(cp->'variantLabel',120),'instructions',public.menu_text(cp->'instructions',500,true),
 'notesLabel',public.menu_text(cp->'notesLabel',120),'notesPlaceholder',public.menu_text(cp->'notesPlaceholder',500,true));
 for v in select value from jsonb_array_elements(public.menu_array(p_value->'variants',1,8)) loop
  perform public.menu_object(v,array['code','name','priceSatang']); k:=public.menu_code(v->'code');
  if k=any(codes) then raise exception 'รหัสซ้ำ' using errcode='PT400'; end if; codes:=array_append(codes,k);
  variants:=variants||jsonb_build_array(jsonb_build_object('code',k,'name',public.menu_text(v->'name',80),'priceSatang',public.menu_integer(v->'priceSatang',1,100000)));
 end loop;
 for g in select value from jsonb_array_elements(public.menu_array(p_value->'groups',0,8)) loop
  perform public.menu_object(g,array['code','name','min','max','enabled','limitsByVariant','options']); k:=public.menu_code(g->'code');
  if k=any(group_codes) then raise exception 'รหัสกลุ่มซ้ำ' using errcode='PT400'; end if; group_codes:=array_append(group_codes,k);
  enabled:=public.menu_boolean(coalesce(g->'enabled','true')); bounds:=coalesce(g->'limitsByVariant','{}');
  perform public.menu_object(bounds,codes);
  normalized:='{}'; for k,d in select * from jsonb_each(bounds) loop normalized:=normalized||jsonb_build_object(k,public.menu_limits(d)); end loop;
  bounds:=normalized; options:='[]'; option_codes:='{}'; defaults:=0; choices:=0;
  for o in select value from jsonb_array_elements(public.menu_array(g->'options',1,20)) loop
   perform public.menu_object(o,array['code','name','priceSatang','defaultQuantity','enabled']); k:=public.menu_code(o->'code');
   if k=any(option_codes) then raise exception 'รหัสตัวเลือกซ้ำ' using errcode='PT400'; end if; option_codes:=array_append(option_codes,k);
   d:=jsonb_build_object('code',k,'name',public.menu_text(o->'name',120),'priceSatang',public.menu_integer(o->'priceSatang',0,100000),
    'defaultQuantity',public.menu_integer(coalesce(o->'defaultQuantity','0'),0,1),'enabled',public.menu_boolean(coalesce(o->'enabled','true')));
   if not (d->>'enabled')::boolean and (d->>'defaultQuantity')::integer>0 then raise exception 'ตัวเลือกเริ่มต้นต้องเปิดใช้งาน' using errcode='PT400'; end if;
   defaults:=defaults+(d->>'defaultQuantity')::integer; if (d->>'enabled')::boolean then choices:=choices+1; end if;
   options:=options||jsonb_build_array(d);
  end loop;
  d:=public.menu_limits(jsonb_build_object('min',g->'min','max',g->'max'));
  if enabled then foreach k in array codes loop
   normalized:=coalesce(bounds->k,d);
   if choices<(normalized->>'min')::integer or defaults>(normalized->>'max')::integer then raise exception 'ตัวเลือกที่เปิดใช้หรือค่าเริ่มต้นไม่ตรงจำนวนที่กำหนด' using errcode='PT400'; end if;
  end loop; end if;
  groups:=groups||jsonb_build_array(d||jsonb_build_object('code',public.menu_code(g->'code'),'name',public.menu_text(g->'name',120),'enabled',enabled,'limitsByVariant',bounds,'options',options));
 end loop;
 foreach k in array codes loop
  required:=0;
  for g in select value from jsonb_array_elements(groups) where (value->>'enabled')::boolean loop
   select coalesce(sum((value->>'defaultQuantity')::integer),0) into defaults from jsonb_array_elements(g->'options');
   required:=required+greatest(defaults,(coalesce(g->'limitsByVariant'->k,g)->>'min')::integer);
  end loop;
  if required>20 then raise exception 'ตัวเลือกขั้นต่ำและค่าเริ่มต้นรวมกันต้องไม่เกิน 20 อย่าง' using errcode='PT400'; end if;
 end loop;
 for d in select value from jsonb_array_elements(public.menu_array(p_value->'prepNotes',0,5)) loop
  note:=public.menu_text(d,80); if notes ? note then raise exception 'หมายเหตุซ้ำ' using errcode='PT400'; end if; notes:=notes||jsonb_build_array(note);
 end loop;
 return jsonb_build_object('code',public.menu_code(p_value->'code'),'name',public.menu_text(p_value->'name',120),'category',c,
 'description',public.menu_text(p_value->'description',500,true),'unit',public.menu_text(p_value->'unit',20),'available',public.menu_boolean(p_value->'available'),
 'copy',cp,'variants',variants,'groups',groups,'prepNotes',notes);
end $$;

create function public.owner_manage_menu(p_actor uuid,p_request_key uuid,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare old_request public.owner_menu_requests; old public.menu_items; d jsonb; v jsonb; g jsonb; o jsonb; entry jsonb;
 kind text; menu_id uuid; category_id_value uuid; group_id_value uuid; option_id_value uuid; expected bigint; item_code text; n integer; ord integer; c text;
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
  if old.id is null or old.category_id<>category_id_value then select coalesce(max(sort_order),-1)+1 into ord from public.menu_items where category_id=category_id_value; else ord:=old.sort_order; end if;
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
  if category_id_value is null then raise exception 'ไม่พบหมวดหมู่เมนู' using errcode='PT400'; end if;
  d:=public.menu_array(p_payload->'entries',0,1000);
  for entry in select value from jsonb_array_elements(d) loop
   perform public.menu_object(entry,array['code','revision']); perform public.menu_code(entry->'code'); perform public.menu_integer(entry->'revision',1,9007199254740991);
  end loop;
  if exists(select 1 from jsonb_array_elements(d) e group by e->>'code' having count(*)>1) then raise exception 'รหัสเมนูซ้ำ' using errcode='PT400'; end if;
  if jsonb_array_length(d)<>(select count(*) from public.menu_items where category_id=category_id_value and is_active)
   or exists(select 1 from public.menu_items m where m.category_id=category_id_value and m.is_active and not exists(select 1 from jsonb_array_elements(d) e where e->>'code'=m.code and (e->>'revision')::bigint=m.revision))
   then raise exception 'เมนูถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนจัดลำดับ' using errcode='PT409'; end if;
  n:=0; for entry in select value from jsonb_array_elements(d) loop update public.menu_items set sort_order=n where code=entry->>'code'; n:=n+1; end loop;
 else raise exception 'คำสั่งจัดการเมนูไม่ถูกต้อง' using errcode='PT400'; end if;
 insert into public.owner_menu_requests(request_key,actor_id,payload,result) values(p_request_key,p_actor,p_payload,'{"ok":true}');
 return '{"ok":true}'::jsonb;
end $$;

-- Preserve the existing retry, authorization, queue and snapshot transaction.
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

do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('advance_menu_revision','menu_catalog_items','owner_menu_catalog','menu_object','menu_text','menu_code','menu_integer','menu_boolean','menu_array','menu_limits','validate_menu_definition','owner_manage_menu') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.sig);
 execute format('grant execute on function %s to service_role',r.sig);
 end loop;
end $$;
commit;

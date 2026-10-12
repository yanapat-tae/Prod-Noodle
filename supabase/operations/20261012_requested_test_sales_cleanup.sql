-- Explicitly requested by the shop owner on 12 October 2026: all existing sales
-- were test entries; first shop trial is 13 October 2026. Run once, separately
-- from schema migration. Never broaden this fixed snapshot to later orders.
begin;
select pg_advisory_xact_lock(814208);
do $$
declare actor uuid; reviewed jsonb; refs jsonb; result_value jsonb; fingerprint text;
begin
 select auth_user_id into actor from public.admins where display_name='เต้' and role='owner' and is_active;
 if actor is null then raise exception 'Requested owner profile unavailable'; end if;
 select md5(jsonb_agg(to_jsonb(o)-'sales_deleted_at' order by o.id)::text) into fingerprint from public.orders o
 where created_at<='2026-10-11T07:54:57.113539Z'::timestamptz;
 if fingerprint<>'8a3522eef5531a9c0e03836753886edc' or fingerprint is null then raise exception 'Reviewed test-sale snapshot changed; abort cleanup'; end if;
 if (select count(*) from public.orders where created_at<='2026-10-11T07:54:57.113539Z')<>28 then raise exception 'Expected exactly 28 reviewed test orders'; end if;
 reviewed:=public.owner_sales_history(actor);
 select jsonb_agg(jsonb_build_object('kind','order','id',r->>'id','version',r->>'version') order by r->>'id') into refs
 from jsonb_array_elements(reviewed->'records') r
 where r->>'kind'='order' and exists(select 1 from public.orders o where o.id::text=r->>'id' and o.created_at<='2026-10-11T07:54:57.113539Z');
 if jsonb_array_length(refs)<>28 or refs is null then raise exception 'Expected exactly 28 undeleted reviewed records'; end if;
 result_value:=public.owner_delete_sales(actor,gen_random_uuid(),jsonb_build_object('records',refs,'reason','ล้างยอดทดลองก่อนเริ่มใช้ที่ร้านวันที่ 13 ต.ค. 2569 ตามคำขอเจ้าของร้าน (ดำเนินการโดย Codex)'));
 if (result_value->>'count')::int<>28 then raise exception 'Unexpected cleanup count'; end if;
end $$;
commit;

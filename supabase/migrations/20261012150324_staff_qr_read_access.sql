-- Keep the existing RPC name for already-open frontends and owner rotation.
-- Only active staff may read the ten existing QR entries. No token is changed.
begin;
create or replace function public.owner_qr_entries()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_actor(auth.uid());
 select jsonb_agg(jsonb_build_object('key',e.entry_key,'token',e.display_token,'revision',e.revision,
  'label',case when t.table_number is not null then 'โต๊ะ '||t.table_number when e.entry_key='takeaway-front' then 'กลับบ้าน · หน้าร้าน' else 'กลับบ้าน · สั่งล่วงหน้า / LINE' end)
  order by coalesce(t.table_number,case when e.entry_key='takeaway-front' then 9 else 10 end))
 into result from public.qr_entrypoints e left join public.restaurant_tables t on t.id=e.table_id;
 return coalesce(result,'[]'::jsonb);
end $$;
revoke all on function public.owner_qr_entries() from public,anon,authenticated;
grant execute on function public.owner_qr_entries() to authenticated;
-- owner_rotate_qr still requires an active owner; direct table access stays revoked.
commit;

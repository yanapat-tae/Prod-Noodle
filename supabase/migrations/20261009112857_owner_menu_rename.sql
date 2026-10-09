begin;
-- Overload preserves older deployed clients; immutable order snapshots are untouched.
create function public.edit_menu(p_actor uuid,p_code text,p_prices jsonb,p_available boolean,p_name text)
returns jsonb language plpgsql set search_path='' as $$
declare normalized_name text; result jsonb;
begin
 perform pg_advisory_xact_lock(814208);
 perform public.require_actor(p_actor,true);
 normalized_name:=public.app_trim(p_name);
 if normalized_name is null or char_length(normalized_name) not between 1 and 120 then
  raise exception 'ชื่อเมนูต้องมี 1–120 ตัวอักษร' using errcode='PT400';
 end if;
 result:=public.edit_menu(p_actor,p_code,p_prices,p_available);
 update public.menu_items set name=normalized_name where code=p_code;
 return result;
end $$;
revoke all on function public.edit_menu(uuid,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.edit_menu(uuid,text,jsonb,boolean,text) to service_role;
commit;

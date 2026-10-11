-- Run once after pos_bill_integrity; first inspect Auth + profile readback.
-- Uses existing Auth users only. Never creates users/passwords or touches other profiles.
begin;
do $$
declare target record; actual uuid; slot integer; existing public.admins; owner_count integer;
begin
 perform pg_advisory_xact_lock(814208);
 select count(*) into owner_count from public.admins a join auth.users u on u.id=a.auth_user_id
 where lower(u.email) in ('yanapat1999@gmail.com','pimcharat.c@gmail.com') and a.role='owner' and a.is_active;
 if owner_count<>2 then raise exception 'Existing owners differ; stop and inspect before changing any profile'; end if;
 for target in select * from (values
  ('sittichaicherdkiattikul@gmail.com','ae815ee5-845e-4159-a649-fe8687254981'::uuid,'พ่อ','admin',3),
  ('kyi.27@icloud.com','3853da58-9bd4-457c-97cf-97e060201954'::uuid,'ฟ้า','admin',4),
  ('prang.kantarat@gmail.com','c74251bb-cc92-4f69-ab1c-5614b687947f'::uuid,'พี่ปราง','owner',5),
  ('prang.kantarat@hotmail.com','74d32d1a-6eaf-4610-8e6d-d14186583baa'::uuid,'แม่','admin',6)
 ) v(email,uid,name,role,account_slot) loop
  select id into actual from auth.users where lower(email)=target.email;
  if actual is distinct from target.uid then raise exception 'Email/UID mismatch: %',target.email; end if;
  select * into existing from public.admins where auth_user_id=actual;
  if existing.auth_user_id is null then
   if exists(select 1 from public.admins where account_slot=target.account_slot) then raise exception 'Slot occupied; no other account may be changed'; end if;
   insert into public.admins(auth_user_id,account_slot,display_name,role,is_active)
   values(actual,target.account_slot,target.name,target.role,true);
  else
   -- Exact target accounts only; preserve their slot if already registered.
   update public.admins set display_name=target.name,role=target.role,is_active=true where auth_user_id=actual;
  end if;
 end loop;
 update public.admins a set display_name=case lower(u.email) when 'yanapat1999@gmail.com' then 'เต้' else 'ปลั๊ก' end
 from auth.users u where a.auth_user_id=u.id and lower(u.email) in ('yanapat1999@gmail.com','pimcharat.c@gmail.com');
end $$;
commit;

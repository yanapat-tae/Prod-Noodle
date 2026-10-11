import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite(), owner=randomUUID(), staff=randomUUID();
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const rpc=(fn,args=[])=>scalar(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const place=(table=1,code='water',quantity=1,key=randomUUID())=>{
 const payload=JSON.stringify({channel:table?'dine_in':'takeaway',tableNumber:table,lines:[{itemCode:code,variantCode:'normal',quantity,options:[],notes:[]}],expectedTotalSatang:(code==='water'?1000:2500)*quantity});
 return rpc('place_order',[payload,key,createHash('sha256').update(payload).digest('hex'),null,staff]);
};
const pay=(orders,method='cash',key=randomUUID(),actor=staff,confirmed=true)=>rpc('staff_pay_bill',[actor,orders[0].id,key,JSON.stringify({method,confirmed,expectedOrderIds:orders.map(o=>o.id),expectedTotalSatang:orders.reduce((s,o)=>s+o.totalSatang,0)})]);
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
 const root=new URL('../supabase/',import.meta.url), first=['202610050001_initial_schema.sql','202610050002_application_api.sql'];
 for(const file of first) await db.exec(readFileSync(new URL('migrations/'+file,root),'utf8'));
 for(const file of ['seed.sql','menu-seed.sql']) await db.exec(readFileSync(new URL(file,root),'utf8'));
 for(const file of readdirSync(new URL('migrations/',root)).filter(f=>f.endsWith('.sql')&&!first.includes(f)).sort()) await db.exec(readFileSync(new URL('migrations/'+file,root),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,staff]);
 await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,6,'Staff','admin')",[owner,staff]);
});
after(()=>db.close());
test('Two rounds settle once, close bill, retain kitchen state and new order creates new bill',async()=>{
 const a=await place(),b=await place(); assert.equal(a.visitId,b.visitId);
 const key=randomUUID(); const result=await pay([a,b],'thai_chuay_thai',key);
 assert.equal(result.totalSatang,2000); assert.equal(result.orders.length,2);
 assert(result.orders.every(o=>o.paidAt&&o.paymentMethod==='thai_chuay_thai'&&o.status==='new'));
 assert.equal(await scalar('select closed_at is not null from public.table_sessions where id=$1',[a.visitId]),true);
 assert.deepEqual(await pay([a,b],'thai_chuay_thai',key),result);
 await pay([a,b],'thai_chuay_thai');
 assert.equal(await scalar('select count(*)::int from public.bill_payments'),1);
 assert.equal(await scalar("select sum(amount_satang)::int from public.payment_transactions where kind='capture'"),2000);
 assert.notEqual((await place()).visitId,a.visitId);
 await assert.rejects(()=>pay([a,b],'cash',key),e=>e.code==='PT409');
});
test('Stale same-total membership, missing confirmation, unknown method and disabled actor cannot pay',async()=>{
 const a=await place(2), b=await place(2); const before=await scalar('select count(*)::int from public.bill_payments');
 await assert.rejects(()=>pay([a]),e=>e.code==='PT409');
 await assert.rejects(()=>pay([a,b],'thai_chuay_thai',randomUUID(),staff,false),e=>e.code==='PT400');
 await assert.rejects(()=>pay([a,b],'bank_auto'),e=>e.code==='PT400');
 await assert.rejects(()=>pay([a,b],'cash',randomUUID(),randomUUID()),e=>e.code==='PT403');
 await db.query("update public.orders set fulfillment_status='cancelled' where id=$1",[a.id]);
 const c=await place(2);
 await assert.rejects(()=>pay([a,b]),e=>e.code==='PT409');
 assert.equal(await scalar('select count(*)::int from public.bill_payments'),before);
 await pay([b,c]);
});
test('Parallel devices receive one receipt and order/payment race rejects unseen rounds',async()=>{
 const a=await place(3), b=await place(3);
 const results=await Promise.allSettled(Array.from({length:8},()=>pay([a,b])));
 assert(results.every(r=>r.status==='fulfilled'));
 assert.equal(new Set(results.map(r=>r.value.id)).size,1);
 assert.equal(await scalar('select count(*)::int from public.bill_payments where table_session_id=$1',[a.visitId]),1);
 const c=await place(4); await place(4);
 await assert.rejects(()=>pay([c]),e=>e.code==='PT409');
});
test('Report keeps drink revenue and payment method while ranking only food; refunds remain single',async()=>{
 const drink=await place(null),food=await place(null,'grass-jelly');
 await pay([drink],'thai_chuay_thai'); await pay([food]);
 const date=await scalar("select (now() at time zone 'Asia/Bangkok')::date::text");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]); await db.exec('set role authenticated');
 try {
 const report=await rpc('staff_sales_report',[date,await scalar('select ($1::date+1)::text',[date])]);
 assert.equal(report.top.length,1); assert.equal(report.top[0].name,'เฉาก๊วยโบราณ');
 assert.equal(report.payments.find(p=>p.method==='thai_chuay_thai').value,3000);
 for(const fn of ['owner_menu_catalog','owner_manage_menu']) await assert.rejects(()=>rpc(fn,fn==='owner_menu_catalog'?[owner]:[owner,randomUUID(),'{}']),/permission denied/);
 for(const [table,column] of [['menu_items','sort_order'],['menu_variants','price_satang'],['menu_categories','sort_order'],['menu_item_options','sort_order'],['menu_item_option_groups','sort_order']]) await assert.rejects(()=>db.query(`update public.${table} set ${column}=${column} where false`),/permission denied/);
 await assert.rejects(()=>pay([food]),/permission denied/);
 } finally { await db.exec('reset role'); }
 await assert.rejects(()=>rpc('owner_menu_catalog',[staff]),e=>e.code==='PT403');
 await rpc('staff_order_action',[owner,food.id,'refund',null]); await rpc('staff_order_action',[owner,food.id,'refund',null]);
 assert.equal(await scalar("select count(*)::int from public.payment_transactions where order_id=$1 and kind='refund'",[food.id]),1);
});
test('Global reorder validates membership/revisions and persists across fresh reads; note alters only prep text',async()=>{
 const cat=await rpc('owner_menu_catalog',[owner]),items=cat.items.filter(i=>!i.archived),reverse=[...items].reverse();
 const payload={kind:'reorder',category:'all',entries:reverse.map(i=>({code:i.code,revision:i.revision}))};
 await rpc('owner_manage_menu',[owner,randomUUID(),JSON.stringify(payload)]);
 assert.deepEqual((await rpc('menu_catalog')).map(i=>i.code),reverse.map(i=>i.code));
 await assert.rejects(()=>rpc('owner_manage_menu',[owner,randomUUID(),JSON.stringify(payload)]),e=>e.code==='PT409');
 const jelly=(await rpc('menu_catalog')).find(i=>i.code==='grass-jelly');
 assert.deepEqual(jelly.prepNotes,['ไม่ใส่น้ำตาลทรายแดง']); assert.equal(jelly.name,'เฉาก๊วยโบราณ'); assert.equal(jelly.variants[0].priceSatang,2500);
});

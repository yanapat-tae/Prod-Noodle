import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite(), owner = randomUUID(), staff = randomUUID();
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const rpc = (fn, args = []) => scalar(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
const place = async () => {
 const payload = JSON.stringify({ channel: 'takeaway', tableNumber: null, lines: [{ itemCode: 'grass-jelly', variantCode: 'normal', quantity: 1, options: [], notes: [] }], expectedTotalSatang: 2500 });
 return rpc('place_order', [payload, randomUUID(), createHash('sha256').update(payload).digest('hex'), null, staff]);
};
const history = () => rpc('owner_sales_history', [owner]);
const remove = (records, key = randomUUID(), actor = owner, reason = 'ทดลองก่อนเปิดร้าน') => rpc('owner_delete_sales', [actor, key, JSON.stringify({ records: records.map(({kind,id,version}) => ({kind,id,version})), reason })]);
before(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
 const root = new URL('../supabase/', import.meta.url), first = ['202610050001_initial_schema.sql','202610050002_application_api.sql'];
 for (const f of first) await db.exec(readFileSync(new URL('migrations/' + f, root), 'utf8'));
 for (const f of ['seed.sql','menu-seed.sql']) await db.exec(readFileSync(new URL(f, root), 'utf8'));
 for (const f of readdirSync(new URL('migrations/', root)).filter(f => f.endsWith('.sql') && !first.includes(f)).sort()) await db.exec(readFileSync(new URL('migrations/' + f, root), 'utf8'));
 await db.query('insert into auth.users values($1),($2)', [owner, staff]);
 await db.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,6,'Staff','admin')", [owner, staff]);
});
after(() => db.close());
test('only active owners can inspect/delete history; direct browser execution and writes are denied', async () => {
 await assert.rejects(() => rpc('owner_sales_history', [staff]), e => e.code === 'PT403');
 await assert.rejects(() => remove([], randomUUID(), staff), e => e.code === 'PT403');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
 await db.exec('set role authenticated');
 try {
  await assert.rejects(() => history(), /permission denied/);
  await assert.rejects(() => db.exec('update public.orders set sales_deleted_at=now()'), /permission denied/);
  await assert.rejects(() => db.exec('select * from public.sales_deletions'), /permission denied/);
 } finally { await db.exec('reset role'); }
});
test('deleting paid/refunded orders clears all reporting measures without modifying captures or creating refunds; retry is safe', async () => {
 const a = await place(), b = await place();
 await rpc('staff_order_action', [staff, a.id, 'pay', 'cash']);
 await rpc('staff_order_action', [staff, b.id, 'pay', 'promptpay']);
 await rpc('staff_order_action', [owner, a.id, 'refund', null]);
 const records = (await history()).records, key = randomUUID();
 const ledger = await scalar('select jsonb_agg(to_jsonb(p) order by id) from public.payment_transactions p');
 const result = await remove(records, key);
 assert.equal(result.count, 2); assert.deepEqual(await remove(records, key), result);
 await assert.rejects(() => remove(records, key, owner, 'different'), e => e.code === 'PT409');
 assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(p) order by id) from public.payment_transactions p'), ledger);
 assert.equal((await history()).records.length, 0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
 const date = await scalar("select (now() at time zone 'Asia/Bangkok')::date::text");
 const report = await rpc('staff_sales_report', [date, await scalar('select ($1::date+1)::text', [date])]);
 for (const field of ['net','gross','refund','count','detailGross']) assert.equal(report[field], 0);
 assert.deepEqual(report.top, []); assert(report.payments.every(p => p.value === 0)); assert(report.hourly.every(p => p.value === 0));
 await assert.rejects(() => rpc('staff_order_action', [owner, b.id, 'refund', null]), e => e.code === 'PT409');
 assert.equal(await scalar('select count(*)::int from public.sales_deletions'), 1);
});
test('stale preview fails atomically; new orders outside selected snapshot remain untouched; empty reason rejected', async () => {
 const a = await place(), b = await place(); const records = (await history()).records;
 await rpc('staff_order_action', [staff, b.id, 'pay', 'cash']);
 await assert.rejects(() => remove(records), e => e.code === 'PT409');
 assert.equal((await history()).records.length, 2);
 await assert.rejects(async () => remove((await history()).records, randomUUID(), owner, ' '), e => e.code === 'PT400');
 const reviewed = (await history()).records; const fresh = await place();
 await remove(reviewed); const remaining = (await history()).records;
 assert.deepEqual(remaining.map(r => r.id), [fresh.id]);
 assert.equal(await scalar('select sales_deleted_at is not null from public.orders where id=$1', [a.id]), true);
});
test('delivery summaries are excluded and a new import can replace a deleted summary without replaying its old batch', async () => {
 const date = await scalar("select (now() at time zone 'Asia/Bangkok')::date::text");
 const rows = JSON.stringify([{date,channel:'grabfood',grossSatang:8000,discountSatang:1000,refundSatang:500,orderCount:2}]);
 const key=randomUUID(), hash=createHash('sha256').update(rows).digest('hex');
 await rpc('import_delivery_summary',[owner,rows,hash,key]);
 const summary=(await history()).records.find(r=>r.kind==='summary'); assert(summary);
 await remove([summary]);
 assert(!(await history()).records.some(r=>r.kind==='summary'));
 await rpc('import_delivery_summary',[owner,rows,hash,key]);
 assert(!(await history()).records.some(r=>r.kind==='summary'));
 await rpc('import_delivery_summary',[owner,rows,hash,randomUUID()]);
 assert((await history()).records.some(r=>r.kind==='summary'));
});
test('deleting an unpaid round invalidates stale bill membership and closes only fully deleted visits', async () => {
 const placeAt=async table=>{
  const payload=JSON.stringify({channel:'dine_in',tableNumber:table,lines:[{itemCode:'water',variantCode:'normal',quantity:1,options:[],notes:[]}],expectedTotalSatang:1000});
  return rpc('place_order',[payload,randomUUID(),createHash('sha256').update(payload).digest('hex'),null,staff]);
 };
 const a=await placeAt(3),b=await placeAt(3),records=(await history()).records.filter(r=>[a.id,b.id].includes(r.id));
 await remove(records.filter(r=>r.id===a.id));
 assert.equal(await scalar('select closed_at is null from public.table_sessions where id=$1',[a.visitId]),true);
 const pay=ids=>rpc('staff_pay_bill',[staff,b.id,randomUUID(),JSON.stringify({method:'cash',confirmed:true,expectedOrderIds:ids,expectedTotalSatang:ids.length*1000})]);
 await assert.rejects(()=>pay([a.id,b.id]),e=>e.code==='PT409');
 const receipt=await pay([b.id]); assert.equal(receipt.totalSatang,1000);
 const c=await placeAt(4); await remove((await history()).records.filter(r=>r.id===c.id));
 assert.equal(await scalar('select closed_at is not null from public.table_sessions where id=$1',[c.visitId]),true);
});
test('paid bill receipt replay cannot report success after a non-anchor round was deleted', async () => {
 const payload=JSON.stringify({channel:'dine_in',tableNumber:5,lines:[{itemCode:'water',variantCode:'normal',quantity:1,options:[],notes:[]}],expectedTotalSatang:1000});
 const placeAt=()=>rpc('place_order',[payload,randomUUID(),createHash('sha256').update(payload).digest('hex'),null,staff]);
 const a=await placeAt(),b=await placeAt(),key=randomUUID(),input=JSON.stringify({method:'cash',confirmed:true,expectedOrderIds:[a.id,b.id],expectedTotalSatang:2000});
 await rpc('staff_pay_bill',[staff,a.id,key,input]);
 await remove((await history()).records.filter(r=>r.id===b.id));
 await assert.rejects(()=>rpc('staff_pay_bill',[staff,a.id,key,input]),e=>e.code==='PT409');
 await assert.rejects(()=>rpc('staff_pay_bill',[staff,a.id,randomUUID(),input]),e=>e.code==='PT409');
});

// Optional native PostgreSQL test. Only a localhost, empty, disposable database is accepted.
// Install pg in a temporary tools directory; PROD_POSTGRES_TOOLS selects that directory.
import { createRequire } from 'node:module';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const connectionString=process.env.PROD_TEST_DATABASE_URL;
if(!connectionString) throw new Error('Set PROD_TEST_DATABASE_URL to a disposable localhost database');
const parsed=new URL(connectionString);
if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||!parsed.pathname.startsWith('/prod_pos_test_')) throw new Error('Only disposable local prod_pos_test_* databases may be used');
const require=createRequire(import.meta.url),{Pool}=require(process.env.PROD_POSTGRES_TOOLS+'/node_modules/pg');
const pool=new Pool({connectionString,max:12});
const scalar=async(sql,args=[])=>Object.values((await pool.query(sql,args)).rows[0])[0];
const rpc=(name,args)=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const owner=randomUUID(),staff=randomUUID();
try{
 if(await scalar("select to_regclass('public.orders')")!==null) throw new Error('Database is not empty; never replay migrations');
 await pool.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
 const root=new URL('../supabase/',import.meta.url),first=['202610050001_initial_schema.sql','202610050002_application_api.sql'];
 for(const file of first) await pool.query(readFileSync(new URL('migrations/'+file,root),'utf8'));
 for(const file of ['seed.sql','menu-seed.sql']) await pool.query(readFileSync(new URL(file,root),'utf8'));
 for(const file of readdirSync(new URL('migrations/',root)).filter(f=>f.endsWith('.sql')&&!first.includes(f)).sort()) await pool.query(readFileSync(new URL('migrations/'+file,root),'utf8'));
 await pool.query('insert into auth.users values($1),($2)',[owner,staff]);
 await pool.query("insert into public.admins(auth_user_id,account_slot,display_name,role) values($1,1,'Owner','owner'),($2,6,'Staff','admin')",[owner,staff]);
 const place=async(table,key=randomUUID())=>{const payload=JSON.stringify({channel:'dine_in',tableNumber:table,lines:[{itemCode:'water',variantCode:'normal',quantity:1,options:[],notes:[]}],expectedTotalSatang:1000});return rpc('place_order',[payload,key,createHash('sha256').update(payload).digest('hex'),null,staff]);};
 const pay=(orders,key=randomUUID())=>rpc('staff_pay_bill',[staff,orders[0].id,key,JSON.stringify({method:'thai_chuay_thai',confirmed:true,expectedOrderIds:orders.map(o=>o.id),expectedTotalSatang:orders.length*1000})]);
 const connections=await Promise.all(Array.from({length:8},()=>pool.connect()));
 const pids=await Promise.all(connections.map(c=>c.query('select pg_backend_pid()')));connections.forEach(c=>c.release());
 assert.equal(new Set(pids.map(r=>r.rows[0].pg_backend_pid)).size,8);
 const sameKey=randomUUID(),duplicates=await Promise.all(Array.from({length:8},()=>place(1,sameKey)));
 assert.equal(new Set(duplicates.map(o=>o.id)).size,1);
 const rounds=await Promise.all(Array.from({length:8},()=>place(2)));
 assert.equal(new Set(rounds.map(o=>o.visitId)).size,1);
 const receipts=await Promise.all(Array.from({length:8},()=>pay(rounds)));
 assert.equal(new Set(receipts.map(r=>r.id)).size,1);
 assert.equal(Number(await scalar('select sum(amount_satang) from public.payment_transactions where bill_payment_id=$1',[receipts[0].id])),8000);
 assert.equal(Number(await scalar('select count(*) from public.bill_payments')),1);
 // Force both race orders deterministically using held advisory locks, separate connections.
 for(const orderFirst of [true,false]){
 const a=await place(orderFirst?3:4),gate=await pool.connect();
 await gate.query('begin');await gate.query('select pg_advisory_xact_lock(814208)');
 const mutation=orderFirst?place(3):pay([a]);
 // Wait for the first contender to enter the lock queue before dispatching the other.
 let queued=false;
 for(let n=0;n<100&&!queued;n++) queued=Number(await scalar("select count(*) from pg_locks where locktype='advisory' and not granted"))>0;
 assert(queued,'First mutation must be queued');
 const other=orderFirst?pay([a]):place(4);
 await gate.query('commit');gate.release();
 const [x,y]=await Promise.allSettled([mutation,other]);
 assert.equal(x.status,'fulfilled');
 if(orderFirst){assert.equal(y.status,'rejected');assert.equal(y.reason.code,'PT409');}
 else {assert.equal(y.status,'fulfilled');assert.notEqual(y.value.visitId,a.visitId);}
 }
 console.log(JSON.stringify({postgres:await scalar('select version()'),independentConnections:8,duplicateOrders:1,concurrentReceiptCount:1,ledgerTotalSatang:8000,races:['order-first rejects stale payment','payment-first creates new bill for later order'],result:'PASS'}));
}finally{await pool.end();}

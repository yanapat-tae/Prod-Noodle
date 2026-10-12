import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createDemoServer } from '../server/demo.mjs';
import { salesReport, businessDate } from '../src/domain.ts';
test('HTTP deletion is owner-only, requires a reviewed selection, persists audit and excludes sales without refunds', async () => {
 const dir = await mkdtemp(join(tmpdir(),'sales-')), dataPath = join(dir,'state.json');
 const server = createDemoServer({ dataPath });
 try {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const call = async (path,body,token,key) => {
   const r = await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   return { status:r.status, data:await r.json() };
  };
  const owner = (await call('/staff/login',{account:'demo-1',pin:'1234'})).data, staff = (await call('/staff/login',{account:'demo-2',pin:'1234'})).data;
  assert.equal((await call('/staff/sales/history')).status,401);
  assert.equal((await call('/staff/sales/history',undefined,staff.token)).status,403);
  const order = (await call('/staff/orders',{channel:'takeaway',tableNumber:null,expectedTotalSatang:2500,lines:[{itemCode:'grass-jelly',variantCode:'normal',quantity:1,options:[],notes:[]}]},staff.token,randomUUID())).data;
  await call(`/staff/orders/${order.id}/pay`,{method:'cash'},staff.token);
  const history=(await call('/staff/sales/history',undefined,owner.token)).data;
  const payload={reason:'ทดลองก่อนเปิดร้าน',records:history.records.map(({kind,id,version})=>({kind,id,version}))}, key=randomUUID();
  assert.equal((await call('/staff/sales/delete',payload,staff.token,key)).status,403);
  assert.equal((await call('/staff/sales/delete',{...payload,reason:''},owner.token,key)).status,400);
  assert.equal((await call('/staff/sales/delete',payload,owner.token,key)).data.count,1);
  assert.equal((await call('/staff/sales/delete',payload,owner.token,key)).data.count,1);
  assert.equal((await call('/staff/sales/delete',{...payload,reason:'changed'},owner.token,key)).status,409);
  const state=(await call('/staff/state',undefined,staff.token)).data;
  assert.equal(state.orders.length,0); assert.equal(salesReport(state.orders,state.summaries,businessDate()).net,0);
  assert.equal((await call(`/staff/orders/${order.id}/refund`,{},owner.token)).status,409);
  const saved=JSON.parse(await readFile(dataPath,'utf8'));
  assert.equal(saved.orders[0].refundedAt,null); assert(saved.orders[0].paidAt); assert(saved.orders[0].salesDeletedAt);
  assert.equal(Object.keys(saved.salesDeletions).length,1); assert.equal(saved.salesDeletions[key].actor,owner.id);
 } finally { await new Promise(r=>server.close(r)); await rm(dir,{recursive:true,force:true}); }
});
test('a replacement delivery import invalidates a previously reviewed identical summary', async () => {
 const dir=await mkdtemp(join(tmpdir(),'sales-summary-')),server=createDemoServer({dataPath:join(dir,'state.json')});
 try {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const call=async(path,body,token,key)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const owner=(await call('/staff/login',{account:'demo-1',pin:'1234'})).data;
  const input={summaries:[{date:businessDate(),channel:'grabfood',grossSatang:10000,discountSatang:0,refundSatang:0,orderCount:1}]};
  await call('/staff/delivery',input,owner.token,randomUUID());
  const reviewed=(await call('/staff/sales/history',undefined,owner.token)).data.records;
  await call('/staff/delivery',input,owner.token,randomUUID());
  assert.equal((await call('/staff/sales/delete',{reason:'ทดสอบ',records:reviewed.map(({kind,id,version})=>({kind,id,version}))},owner.token,randomUUID())).status,409);
 } finally {await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

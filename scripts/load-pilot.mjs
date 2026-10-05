// Creates test orders. Use only a separate trial project, never the shop's live DB.
import { writeFileSync,mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const cloud=process.env.PILOT_MODE==='supabase';
const base=process.env.PILOT_BASE_URL??'http://127.0.0.1:4174';
const workers=Number(process.env.PILOT_WORKERS??20),perWorker=Number(process.env.PILOT_ORDERS_PER_WORKER??5);
if (process.env.PILOT_ALLOW_WRITE!=='TEST_DATA_ONLY') throw new Error('Set PILOT_ALLOW_WRITE=TEST_DATA_ONLY only for an isolated trial database.');
if (!Number.isInteger(workers)||workers<1||workers>100||!Number.isInteger(perWorker)||perWorker<1||perWorker>10) throw new Error('Workers 1–100; orders per worker 1–10.');
if (cloud&&(!process.env.PILOT_QR_TOKEN||!process.env.PILOT_PUBLISHABLE_KEY||!base.startsWith('https://'))) throw new Error('Cloud trial needs an HTTPS project URL, takeaway QR token and publishable key.');
const samples={menu:[],session:[],order:[]},errors=[],ids=[];
async function call(name,path,body,bearer,key) {
 const group=path==='/orders'?'customer-api':'public-api';
 const target=cloud?base+'/functions/v1/'+group+path:base+'/api'+path;
 const start=performance.now();
 try {
  const res=await fetch(target,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cloud?{apikey:process.env.PILOT_PUBLISHABLE_KEY}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await res.json(); if (!res.ok) throw new Error('HTTP '+res.status+': '+data.error);
  samples[name].push(performance.now()-start); return data;
 } catch(e) { errors.push({operation:name,message:e.message}); throw e; }
}
const menu=await call('menu','/menu'); const item=menu.find(m=>m.code==='water'&&m.available);
if (!item) throw new Error('This script requires the available starter water item.');
const payload={lines:[{itemCode:item.code,variantCode:item.variants[0].code,quantity:1,options:[],notes:[]}],expectedTotalSatang:item.variants[0].priceSatang};
const started=performance.now();
await Promise.allSettled(Array.from({length:workers},async()=>{
 const session=await call('session','/customer/session',{entry:cloud?process.env.PILOT_QR_TOKEN:'takeaway'});
 for(let i=0;i<perWorker;i++) { const key=randomUUID(); const order=await call('order','/orders',payload,session.token,key); ids.push(order.id); if(i===0) { const retry=await call('order','/orders',payload,session.token,key); if(order.id!==retry.id) errors.push({operation:'retry',message:'Duplicate order created'}); } }
}));
const stats=values=>{ const sorted=[...values].sort((a,b)=>a-b); const q=p=>sorted.length?Math.round(sorted[Math.ceil(sorted.length*p)-1]):null; return {success:sorted.length,p50ms:q(.5),p95ms:q(.95),maxMs:q(1)}; };
const report={environment:cloud?'Supabase trial':'local demo',createdAt:new Date().toISOString(),workers,perWorker,elapsedMs:Math.round(performance.now()-started),ordersCreated:ids.length,uniqueOrders:new Set(ids).size,metrics:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,stats(v)])),errors,orderIds:ids};
mkdirSync(resolve('.local-data'),{recursive:true}); writeFileSync(resolve('.local-data/pilot-load-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,orderIds:undefined},null,2));
if (errors.length||ids.length!==workers*perWorker||new Set(ids).size!==ids.length) process.exitCode=1;

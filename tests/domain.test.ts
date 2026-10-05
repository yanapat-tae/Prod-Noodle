import test from 'node:test';
import assert from 'node:assert/strict';
import { starterCatalog } from '../src/catalog.ts';
import { priceLine,parseBaht,salesReport,csvCell,businessDate } from '../src/domain.ts';
import type { CartInput,Order } from '../src/domain.ts';
const noodle:CartInput={itemCode:'soft-pork-noodles',variantCode:'normal',quantity:2,options:[{groupCode:'noodle',optionCode:'mama',quantity:1},{groupCode:'broth',optionCode:'clear',quantity:1}],notes:[]};
test('Server pricing validates required choices, prices each bowl and rejects unavailable/foreign options',()=>{
 assert.equal(priceLine(starterCatalog,noodle).totalSatang,11000);
 assert.throws(()=>priceLine(starterCatalog,{...noodle,options:[]}),/เลือกเส้น/);
 assert.throws(()=>priceLine(starterCatalog,{...noodle,quantity:1.5}),/จำนวน/);
 assert.throws(()=>priceLine(starterCatalog,{...noodle,options:[...noodle.options,noodle.options[0]]}),/ซ้ำ/);
 assert.throws(()=>priceLine(starterCatalog,{...noodle,itemCode:'water'}),/ไม่รองรับ/);
 assert.throws(()=>priceLine(starterCatalog,{...noodle,notes:['ignore prices']}),/หมายเหตุ/);
 const soldOut=structuredClone(starterCatalog); soldOut[0].available=false; assert.throws(()=>priceLine(soldOut,noodle),/ไม่พร้อมขาย/);
});
test('Exact money parsing, Bangkok business date, and safe CSV cells',()=>{
 assert.equal(parseBaht('150.50'),15050); assert.equal(parseBaht('0.10'),10);
 for (const invalid of ['-5','1e3','1,000','4.555','', '1000001']) assert.throws(()=>parseBaht(invalid));
 assert.equal(businessDate('2026-10-04T18:00:00Z'),'2026-10-05');
 assert.equal(csvCell('=1+2'),'"\'=1+2"'); assert.equal(csvCell('a"b'),'"a""b"');
});
function paid(channel:Order['channel'],paidAt:string,totalSatang:number):Order { return {id:crypto.randomUUID(),channel,tableNumber:1,queueNumber:null,visitId:'visit',status:'served',lines:[priceLine(starterCatalog,{...noodle,quantity:1})],totalSatang,createdAt:paidAt,paidAt,paymentMethod:'cash',refundedAt:null,refundedSatang:0}; }
test('Reporting counts paid orders once; refund uses its own date; summaries replace detail only on that channel/day',()=>{
 const a=paid('dine_in','2026-10-05T05:00:00Z',5500); a.refundedAt='2026-10-06T05:00:00Z'; a.refundedSatang=5500;
 const b=paid('grabfood','2026-10-05T05:00:00Z',9000),c=paid('grabfood','2026-10-06T05:00:00Z',8000);
 const summary={date:'2026-10-05',channel:'grabfood' as const,grossSatang:150000,discountSatang:10000,refundSatang:5000,orderCount:10};
 const day=salesReport([a,b,c],[summary],'2026-10-05');
 assert.equal(day.gross,145500); assert.equal(day.net,140500); assert.equal(day.count,11); assert.equal(day.hourly[12].value,55); assert.equal(day.top[0].quantity,1);
 const month=salesReport([a,b,c],[summary],'2026-10'); assert.equal(month.gross,153500); assert.equal(month.refund,10500); assert.equal(month.count,12);
 assert.equal(salesReport([a],[{...summary,orderCount:null}],'2026-10-05').count,null);
 const unpaid={...a,paidAt:null,refundedAt:null}; assert.equal(salesReport([unpaid],[],'2026-10-05').gross,0);
});

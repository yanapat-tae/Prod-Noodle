import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prepareBillPayment } from '../src/bill-payment.ts';
import type { Order } from '../src/domain.ts';
const make=(id:string,visitId='bill'):Order=>({id,visitId,channel:'dine_in',tableNumber:1,queueNumber:null,status:'new',lines:[],totalSatang:1000,createdAt:'2026-10-11T01:00:00Z',paidAt:null,paymentMethod:null,refundedAt:null,refundedSatang:0});
test('Payment planning preserves data until persistence; retries and concurrent receipts cannot double capture',()=>{
 const orders=[make('a'),make('b')],key=randomUUID(),input={method:'thai_chuay_thai',confirmed:true,expectedOrderIds:['a','b'],expectedTotalSatang:2000};
 const before=structuredClone(orders);
 const result=prepareBillPayment(orders,{},'staff','a',key,input);
 assert.deepEqual(orders,before);assert(result.receipt.orders.every(o=>o.paidAt&&o.billPaymentId===key));
 const stored={[key]:result};
 assert.deepEqual(prepareBillPayment(orders,stored,'staff','a',key,input),result);
 assert.deepEqual(prepareBillPayment(orders,stored,'other','b',randomUUID(),input).receipt,result.receipt);
 assert.throws(()=>prepareBillPayment(orders,stored,'other','a',key,input),/คำขออื่น/);
 assert.throws(()=>prepareBillPayment(orders,{},'staff','a',randomUUID(),{...input,confirmed:false}),/ยืนยัน/);
 assert.throws(()=>prepareBillPayment([...orders,make('c')],{},'staff','a',randomUUID(),input),/เปลี่ยน/);
 assert.throws(()=>prepareBillPayment(orders,{},'staff','a',randomUUID(),{...input,expectedOrderIds:['a','a']}),/ยืนยัน/);
});

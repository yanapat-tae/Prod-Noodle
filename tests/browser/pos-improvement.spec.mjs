import {test,expect} from '@playwright/test';
import {starterCatalog} from '../../src/catalog.ts';
import {priceLine} from '../../src/domain.ts';
const staff={id:'demo-2',token:'test-pos',name:'Staff',role:'admin'};
function order(id,itemCode='water'){const line=priceLine(starterCatalog,{itemCode,variantCode:'normal',quantity:1,options:[],notes:[]});return {id,channel:'dine_in',tableNumber:1,queueNumber:null,visitId:'test-bill',status:'new',lines:[line],totalSatang:line.totalSatang,createdAt:'2026-10-11T01:00:00Z',paidAt:null,paymentMethod:null,refundedAt:null,refundedSatang:0};}
async function open(page,{lose=false}={}){
 let orders=[order('round-a'),order('round-b','grass-jelly')],receipt=null;
 const requests=[],keys=[];
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(identity=>localStorage.setItem('prod-demo-staff',JSON.stringify(identity)),staff);
 await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/pay-bill')){
 const input=route.request().postDataJSON(),key=route.request().headers()['idempotency-key'];requests.push(input);keys.push(key);
 if(!receipt){orders=orders.map(o=>({...o,paidAt:'2026-10-11T01:05:00Z',paymentMethod:input.method,billPaymentId:key}));receipt={id:key,billId:'test-bill',totalSatang:input.expectedTotalSatang,method:input.method,paidAt:'2026-10-11T01:05:00Z',orders};}
 if(lose){await route.abort('failed');return;}
 await route.fulfill({json:receipt});return;
 }
 const bodies={'/api/menu':starterCatalog,'/api/staff/me':staff,'/api/staff/state':{orders,visits:receipt?{}:{1:{id:'test-bill'}},summaries:[]}};
 await route.fulfill({json:bodies[path]});
 });
 await page.goto('/admin');await expect(page.locator('.ticket')).toHaveCount(2);
 await page.getByRole('button',{name:'รับชำระเงิน',exact:true}).first().click();
 return {requests,keys,recover:()=>{lose=false;}};
}
test('Bill shows all rounds at 390px; selecting Thai scan requires verification and writes nothing',async({page},info)=>{
 const data=await open(page);
 await expect(page.locator('.bill-round')).toHaveCount(2);
 await expect(page.locator('.bill-total')).toContainText('35 บาท');
 await page.getByRole('button',{name:'สแกนไทยช่วยไทย',exact:true}).click();
 const submit=page.getByRole('button',{name:'ยืนยันรับชำระเงิน',exact:true});
 await expect(submit).toBeDisabled();expect(data.requests).toHaveLength(0);
 await page.getByRole('checkbox',{name:'ตรวจยอด สแกนไทยช่วยไทย เข้าจริงแล้ว',exact:true}).check();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('bill-390.png'),fullPage:true});
 await submit.click();await expect(page.locator('.payment-screen')).toHaveCount(0);
 expect(data.requests).toEqual([{method:'thai_chuay_thai',confirmed:true,expectedOrderIds:['round-a','round-b'],expectedTotalSatang:3500}]);
 await expect(page.locator('.ticket').first()).toContainText('สแกนไทยช่วยไทย');
 await expect(page.getByRole('button',{name:'จัดการเมนู',exact:true})).toHaveCount(0);
});
test('Lost bill response freezes request through reload and retries same key without another receipt',async({page})=>{
 const data=await open(page,{lose:true});
 await page.getByRole('button',{name:'รับเงินสดแล้ว',exact:true}).click();
 await expect(page.getByRole('button',{name:'ลองยืนยันรายการเดิมอีกครั้ง',exact:true})).toBeEnabled();
 const key=data.keys[0];await page.reload();
 // Pending receipt has paid the bill at the server; reopening must be available even when order is paid.
 await expect(page.getByRole('button',{name:'ตรวจรายการรับเงินที่รอยืนยัน',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ตรวจรายการรับเงินที่รอยืนยัน',exact:true}).click();
 data.recover();await page.getByRole('button',{name:'ลองยืนยันรายการเดิมอีกครั้ง',exact:true}).click();
 await expect(page.locator('.payment-screen')).toHaveCount(0);
 expect(new Set(data.keys)).toEqual(new Set([key]));
});
test('Category buttons are visible immediately, filter with one tap and leave cart intact',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 const body=path==='/api/menu'?starterCatalog:path==='/api/customer/session'?{token:'test-customer',visitId:'visit',tableNumber:1,channel:'dine_in'}:[];
 await route.fulfill({json:body});
 });
 await page.goto('/?table=1');
 await expect(page.getByRole('navigation',{name:'หมวดอาหาร',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'ของหวาน',exact:true}).click();
 await page.locator('.menu-card').filter({hasText:'เฉาก๊วยโบราณ'}).getByRole('button',{name:/เลือกเมนูนี้/}).click();
 await expect(page.getByRole('checkbox',{name:'ไม่ใส่น้ำตาลทรายแดง',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/เพิ่มลงตะกร้า/}).click();
 await page.getByRole('button',{name:'เครื่องดื่ม',exact:true}).click();
 await expect(page.getByRole('button',{name:'ดูตะกร้า · 1 รายการ · 25 บาท',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('categories-390.png'),fullPage:true});
});
test('Preview receipt replay preserves refund/fulfillment and closed sessions can read then renew',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {api,resetPreview}=await import('/preview/api.ts');resetPreview();
  const identity=await api.restoreStaff(),session=await api.bootstrap('1');
  const lines=[{itemCode:'water',variantCode:'normal',quantity:1,options:[],notes:[]}];
  const order=await api.createOrder(session,lines,1000,crypto.randomUUID());
  const key=crypto.randomUUID(),input={method:'cash',confirmed:true,expectedOrderIds:[order.id],expectedTotalSatang:1000};
  const receipt=await api.payBill(identity,order.id,input,key);
  await api.status(identity,order.id,'served');await api.refund(identity,order.id);
  await api.payBill(identity,order.id,input,key);await api.payBill(identity,order.id,input,crypto.randomUUID());
  const current=(await api.state(identity)).orders.find(o=>o.id===order.id),own=await api.customerOrders(session);
  let rejection;try{await api.createOrder(session,lines,1000,crypto.randomUUID());}catch(e){rejection=e.status;}
  const next=await api.bootstrap('1',session.token);
  return {status:current.status,refund:current.refundedSatang,ownPaid:own.find(o=>o.id===order.id).paidAt===receipt.paidAt,rejection,newVisit:next.visitId!==session.visitId};
 });
 expect(result).toEqual({status:'served',refund:1000,ownPaid:true,rejection:401,newVisit:true});
});

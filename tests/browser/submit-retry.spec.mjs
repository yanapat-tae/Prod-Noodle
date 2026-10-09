import {test,expect} from '@playwright/test';
const menu=[{code:'water',name:'น้ำเปล่า',category:'drinks',categoryName:'เครื่องดื่ม',description:'',unit:'ขวด',available:true,variants:[{code:'normal',name:'ปกติ',priceSatang:1000}],groups:[],prepNotes:[]}];
async function openCart(page,failures,status){
 const requests=[];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/menu')return route.fulfill({json:menu});
  if(path==='/api/customer/session')return route.fulfill({json:{token:'fault-test-only',channel:'takeaway',tableNumber:null,visitId:null}});
  if(path==='/api/orders'&&route.request().method()==='GET')return route.fulfill({json:[]});
  const input=route.request().postDataJSON();requests.push({input,key:route.request().headers()['idempotency-key']});
  if(requests.length<=failures){if(status)return route.fulfill({status,json:{error:'ราคาเปลี่ยน กรุณาตรวจตะกร้าอีกครั้ง'}});return route.abort('failed');}
  return route.fulfill({json:{id:'saved-order',channel:'takeaway',queueNumber:1,tableNumber:null,visitId:null,status:'new',createdAt:'2026-10-08T10:00:00Z',paidAt:null,refundedAt:null,totalSatang:input.expectedTotalSatang,takeaway:input.takeaway,lines:input.lines.map((l,i)=>({...l,id:'line-'+i,name:'น้ำเปล่า',variantName:'ปกติ',unit:'ขวด',optionNames:[],unitSatang:1000,totalSatang:1000*l.quantity}))}});
 });
 await page.goto('/?table=takeaway');
 await page.getByRole('button',{name:'เลือกเมนูนี้'}).click();
 await page.getByRole('button',{name:/เพิ่มลงตะกร้า/}).click();
 await page.getByRole('button',{name:/ดูตะกร้า/}).click();
 await page.getByLabel('ชื่อผู้สั่ง').fill('ทดสอบเน็ต');
 return requests;
}
test('a lost submit response retries the same order key and shows the saved receipt',async({page})=>{
 const requests=await openCart(page,1);
 await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
 await expect(page.getByRole('heading',{name:'กลับบ้าน-ทดสอบเน็ต · T-01'})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
});
test('an uncertain submit locks the saved draft and survives reload before a same-key retry',async({page})=>{
 const requests=await openCart(page,2);
 await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
 await expect(page.getByRole('alert')).toContainText('ยังยืนยัน');
 await expect(page.getByLabel('ชื่อผู้สั่ง')).toBeDisabled();
 await expect(page.getByRole('button',{name:'เพิ่มจำนวน น้ำเปล่า'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'นำออก'})).toBeDisabled();
 expect(requests).toHaveLength(2);
 await page.reload();
 await expect(page.getByLabel('ชื่อผู้สั่ง')).toBeDisabled();
 await page.getByRole('button',{name:/ลองส่งรายการเดิมอีกครั้ง/}).click();
 await expect(page.getByRole('heading',{name:'กลับบ้าน-ทดสอบเน็ต · T-01'})).toBeVisible();
 expect(requests).toHaveLength(3);expect(requests[2]).toEqual(requests[0]);
});
test('a definite price rejection allows editing and creates a new key for a changed order',async({page})=>{
 const requests=await openCart(page,1,409);
 await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
 await expect(page.getByRole('alert')).toContainText('ราคาเปลี่ยน');
 expect(requests).toHaveLength(1);
 await expect(page.getByLabel('ชื่อผู้สั่ง')).toBeEnabled();
 await page.getByRole('button',{name:'เพิ่มจำนวน น้ำเปล่า'}).click();
 await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
 await expect(page.getByRole('heading',{name:'กลับบ้าน-ทดสอบเน็ต · T-01'})).toBeVisible();
 expect(requests[1].key).not.toBe(requests[0].key);
 expect(requests[1].input.lines[0].quantity).toBe(2);
});

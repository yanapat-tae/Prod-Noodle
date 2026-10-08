import { test, expect } from '@playwright/test';

const menu = [{ code:'water',name:'น้ำเปล่า',category:'drinks',categoryName:'เครื่องดื่ม',description:'',unit:'ขวด',available:true,variants:[{code:'normal',name:'ปกติ',priceSatang:1000}],groups:[],prepNotes:[] }];
async function setup(page) {
  const submissions=[];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body=[];
    if(path==='/api/menu') body=menu;
    if(path==='/api/customer/session') body={token:'test-session',channel:'takeaway',tableNumber:null,visitId:null};
    if(path==='/api/orders'&&route.request().method()==='POST') {
      const payload=route.request().postDataJSON(); submissions.push(payload);
      body={id:'test-order',channel:'takeaway',queueNumber:1,tableNumber:null,visitId:null,status:'new',createdAt:'2026-10-07T10:00:00Z',paidAt:null,refundedAt:null,totalSatang:1000,takeaway:payload.takeaway,lines:payload.lines.map(line=>({...line,id:'line-1',name:'น้ำเปล่า',variantName:'ปกติ',unit:'ขวด',optionNames:[],unitSatang:1000,totalSatang:1000}))};
    }
    await route.fulfill({json:body});
  });
  await page.goto('/?table=takeaway');
  await page.getByRole('button',{name:'เลือกเมนูนี้'}).click();
  await page.getByLabel('หมายเหตุถึงครัว').fill('ไม่ใส่น้ำแข็ง · แยกถุง');
  await page.getByRole('button',{name:/เพิ่มลงตะกร้า/}).click();
  await page.getByRole('button',{name:/ดูตะกร้า/}).click();
  return submissions;
}
test('Takeaway requires a customer name and retains the kitchen note in the receipt',async({page})=>{
  const sent=await setup(page);
  await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
  await expect(page.getByRole('alert')).toContainText('ชื่อ');
  expect(sent).toHaveLength(0);
  await page.getByLabel('ชื่อผู้สั่ง').fill('สมชาย');
  await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
  await expect(page.getByRole('heading',{name:'กลับบ้าน-สมชาย · T-01'})).toBeVisible();
  await expect(page.getByText('ไม่ใส่น้ำแข็ง · แยกถุง',{exact:true})).toBeVisible();
  expect(sent[0].takeaway.customerName).toBe('สมชาย');
  expect(sent[0].lines[0].freeNote).toBe('ไม่ใส่น้ำแข็ง · แยกถุง');
});
test('Village delivery requires address and phone and survives a draft reload',async({page})=>{
  const sent=await setup(page);
  await page.getByLabel('ชื่อผู้สั่ง').fill('คุณเอ');
  await page.getByLabel('ส่งในหมู่บ้านเศรษฐสิริ วงแหวน-สุขาภิบาล2').check();
  await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
  await expect(page.getByRole('alert')).toContainText('บ้านเลขที่');
  await page.getByLabel('บ้านเลขที่ / ซอย').fill('12/3 ซอย 2');
  await page.getByLabel('เบอร์ติดต่อ').fill('0812345678');
  await page.reload();
  await page.getByRole('button',{name:/ดูตะกร้า/}).click();
  await expect(page.getByLabel('ชื่อผู้สั่ง')).toHaveValue('คุณเอ');
  await expect(page.getByLabel('บ้านเลขที่ / ซอย')).toHaveValue('12/3 ซอย 2');
  await page.getByRole('button',{name:/ยืนยันส่งออเดอร์/}).click();
  await expect(page.getByRole('heading',{name:'กลับบ้าน-คุณเอ · T-01'})).toBeVisible();
  expect(sent[0].takeaway).toEqual({customerName:'คุณเอ',villageDelivery:true,deliveryAddress:'12/3 ซอย 2',deliveryPhone:'0812345678'});
});

import { appOrigin,hash,HttpError,randomToken,requestKey,rpc,serve,service,staff } from '../_shared/http.ts';
serve('staff-api',async(req,path,body)=>{
  const db=service(); const actor=await staff(db,req);
  if (req.method!=='POST') throw new HttpError('ไม่พบหน้า',404);
  if (path==='/staff/orders') return rpc(db,'place_order',{p_payload:body,p_key:requestKey(req),p_hash:await hash(JSON.stringify(body)),p_actor:actor});
  const order=path.match(/^\/staff\/orders\/([0-9a-f-]{36})\/(status|pay|refund)$/i);
  if (order) return rpc(db,'staff_order_action',{p_actor:actor,p_id:order[1],p_action:order[2],p_value:order[2]==='status'?body.status:order[2]==='pay'?body.method:null});
  const close=path.match(/^\/staff\/tables\/([1-8])\/close$/);
  if (close) return rpc(db,'close_table',{p_actor:actor,p_number:Number(close[1])});
  if (path==='/staff/menu/create') {
    await staff(db,req,true);
    return rpc(db,'create_menu',{p_actor:actor,p_payload:body});
  }
  if (path==='/staff/menu') return rpc(db,'edit_menu',{p_actor:actor,p_code:body.code,p_prices:body.prices,p_available:body.available});
  if (path==='/staff/delivery') return rpc(db,'import_delivery_summary',{p_actor:actor,p_rows:body.summaries,p_hash:await hash(JSON.stringify(body.summaries)),p_key:requestKey(req)});
  if (path==='/staff/qr') {
    await staff(db,req,true);
    const tokens=Array.from({length:9},(_,i)=>({tableNumber:i<8?i+1:null,token:randomToken()}));
    const entries=await Promise.all(tokens.map(async t=>({tableNumber:t.tableNumber,hash:await hash(t.token)})));
    await rpc(db,'rotate_qr',{p_actor:actor,p_entries:entries});
    return tokens.map(t=>({label:t.tableNumber?'โต๊ะ '+t.tableNumber:'กลับบ้าน',url:appOrigin()+'/?qr='+t.token}));
  }
  throw new HttpError('ไม่พบหน้า',404);
});

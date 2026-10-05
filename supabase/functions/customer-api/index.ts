import { hash,HttpError,requestKey,rpc,serve,service,token } from '../_shared/http.ts';
serve('customer-api',async(req,path,body)=>{
  const bearer=token(req); if (!/^[0-9a-f]{64}$/.test(bearer)) throw new HttpError('กรุณาสแกน QR ใหม่',401);
  const db=service(); const sessionHash=await hash(bearer);
  if (req.method==='GET'&&path==='/orders') return rpc(db,'customer_orders',{p_hash:sessionHash});
  if (req.method==='POST'&&path==='/orders') return rpc(db,'place_order',{p_payload:body,p_key:requestKey(req),p_hash:await hash(JSON.stringify(body)),p_customer_hash:sessionHash});
  throw new HttpError('ไม่พบหน้า',404);
});

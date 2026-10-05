import { hash,HttpError,randomToken,rpc,serve,service,token } from '../_shared/http.ts';
serve('public-api',async(req,path,body)=>{
  const db=service();
  if (req.method==='GET'&&path==='/menu') return rpc(db,'menu_catalog');
  if (req.method==='POST'&&path==='/customer/session') {
    if (typeof body.entry!=='string'||!/^[0-9a-f]{64}$/.test(body.entry)) throw new HttpError('กรุณาสแกน QR ของร้าน');
    const fresh=randomToken(); const old=token(req);
    const result=await rpc(db,'customer_bootstrap',{p_entry_hash:await hash(body.entry),p_new_hash:await hash(fresh),p_old_hash:old?await hash(old):null});
    const {resumed,...session}=result; return {...session,token:resumed?old:fresh};
  }
  throw new HttpError('ไม่พบหน้า',404);
});

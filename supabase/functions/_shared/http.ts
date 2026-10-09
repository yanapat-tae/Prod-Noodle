import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
export class HttpError extends Error {
  status: number;
  constructor(message: string,status=400) { super(message); this.status=status; }
}
function env(name: string) { const v=Deno.env.get(name); if (!v) throw new HttpError('ยังไม่ได้ตั้งค่าบริการ',503); return v; }
export function service(): SupabaseClient { return createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}); }
export function token(req: Request) { return /^Bearer +([^\s]+)$/i.exec(req.headers.get('Authorization')??'')?.[1]??''; }
export async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''); }
export function appOrigin() { return new URL(env('APP_ORIGIN')).origin; }
export async function rpc(db: SupabaseClient,name: string,args: Record<string,unknown>={}) {
  const {data,error}=await db.rpc(name,args);
  if (error) {
    const custom=/^PT(\d{3})$/.exec(error.code);
    if (custom) throw new HttpError(error.message,Number(custom[1]));
    if (['22P02','22007','22008','22003','23514'].includes(error.code)) throw new HttpError('ข้อมูลหรือจำนวนเงินไม่ถูกต้อง');
    // Do not return internal SQL, token hashes, or credentials to the browser.
    console.error('Database operation failed',name,error.code);
    throw new HttpError('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่',500);
  }
  return data;
}
export async function staff(db: SupabaseClient,req: Request,owner=false) {
  const bearer=token(req); if (!bearer) throw new HttpError('กรุณาเข้าสู่ระบบพนักงาน',401);
  const {data,error}=await db.auth.getUser(bearer);
  if (error||!data.user) throw new HttpError('กรุณาเข้าสู่ระบบใหม่',401);
  const {data:profile}=await db.from('admins').select('auth_user_id,role,is_active').eq('auth_user_id',data.user.id).single();
  if (!profile?.is_active||(owner&&profile.role!=='owner')) throw new HttpError('บัญชีนี้ไม่ได้รับสิทธิ์',403);
  return data.user.id;
}
async function boundedBody(req: Request) {
  const reader=req.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[]=[]; let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read(); if (done) break;
      size+=value.byteLength;
      if (size>50000) { await reader.cancel(); throw new HttpError('คำขอใหญ่เกินไป',413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export function serve(group: string,handler: (req:Request,path:string,body:any)=>Promise<unknown>) {
  Deno.serve(async req=>{
    const origin=req.headers.get('Origin'); const headers:Record<string,string>={
      'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'3600',
    };
    try {
      const allowed=appOrigin();
      if (origin&&origin!==allowed) throw new HttpError('Origin ไม่ได้รับอนุญาต',403);
      if (origin) headers['Access-Control-Allow-Origin']=allowed;
      if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
      if (!['GET','POST'].includes(req.method)) throw new HttpError('Method ไม่รองรับ',405);
      const pathname=new URL(req.url).pathname;
      const marker='/functions/v1/'+group;
      // Hosted gateway uses /functions/v1/<name>; local Deno can use /<name>.
      const prefix=pathname===marker||pathname.startsWith(marker+'/')?marker:'/'+group;
      if (pathname!==prefix&&!pathname.startsWith(prefix+'/')) throw new HttpError('ไม่พบหน้า',404);
      const path=pathname.slice(prefix.length);
      let body={};
      if (req.method==='POST') {
        const raw=await boundedBody(req);
        try { body=raw?JSON.parse(raw):{}; } catch { throw new HttpError('JSON ไม่ถูกต้อง'); }
        if (!body||typeof body!=='object'||Array.isArray(body)) throw new HttpError('ข้อมูลไม่ถูกต้อง');
      }
      return new Response(JSON.stringify(await handler(req,path,body)),{status:200,headers});
    } catch(e) {
      if (!(e instanceof HttpError)) console.error('Unhandled handler error');
      return new Response(JSON.stringify({error:e instanceof HttpError?e.message:'ระบบขัดข้อง กรุณาลองใหม่'}),{status:e instanceof HttpError?e.status:500,headers});
    }
  });
}
export function requestKey(req:Request) { const key=req.headers.get('Idempotency-Key')??''; if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new HttpError('คำขอไม่มีรหัสอ้างอิง'); return key; }

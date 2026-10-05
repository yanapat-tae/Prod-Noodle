import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'); const out = resolve(root, '.html-preview-build');
const replacements = [
 ['App.tsx', "location.pathname.startsWith('/admin')", "location.hash.startsWith('#admin')"],
 ['Customer.tsx', "const [entry] = useState(() => { const params = new URLSearchParams(location.search); return params.get('qr') ?? params.get('table') ?? (mode === 'demo' ? '1' : sessionStorage.getItem('prod-entry') ?? ''); });", 'const [entry] = useState(() => api.activeEntry());'],
];
await build({
 root, configFile: false,
 plugins: [{ name: 'standalone-html-preview', enforce: 'pre', resolveId(source, importer) {
   if (importer && source.startsWith('.') && resolve(dirname(importer), source) === resolve(root, 'src/api.ts')) return resolve(root, 'preview/api.ts');
 }, transform(source, id) {
   if (!id.startsWith(resolve(root, 'src/'))) return null;
   let code = source;
   for (const [file, from, to] of replacements) if (id.endsWith('/' + file)) { if (!code.includes(from)) throw new Error('Preview transform needs update: ' + file); code = code.replace(from, to); }
   if (id.endsWith('/App.tsx')) {
     code = code.replace("const Staff = lazy(() => import('./pages/Staff.tsx'));", "import Staff from './pages/Staff.tsx';");
     const start = code.indexOf("<div className={'mode-bar '"); const end = code.indexOf('</div>{!isStaff', start);
     if (start < 0 || end < 0) throw new Error('Preview toolbar transform needs update');
     code = "import HtmlPreviewBar from '../preview/Toolbar.tsx';\n" + code.slice(0, start) + '<HtmlPreviewBar isStaff={isStaff} />' + code.slice(end + 6);
   }
   if (id.endsWith('/Staff.tsx')) {
     code = code.replace('บัญชีทดลองใช้รหัส 1234 เหมือนกัน ใช้เฉพาะโหมดบนเครื่อง บัญชีจริงต้องสร้างใน Supabase Auth', 'บัญชีจำลอง 4 บัญชี เปิดดูได้ทันที หากลองออกจากระบบ รหัสทดลองคือ 1234 ไม่ต้องสมัครบัญชี');
     code = code.replace('<h1>QR สำหรับสั่งอาหาร</h1>', '<h1>QR สำหรับสั่งอาหาร</h1><p className="info-message">QR ใน HTML นี้เป็นตัวอย่างลิงก์ไฟล์ ใช้ดูหน้าตาในเครื่องนี้ ก่อนให้มือถือหลายเครื่องสแกนต้องนำระบบขึ้นออนไลน์</p>');
   }
   code = code.replaceAll('href="/admin"', 'href="#admin"').replaceAll('href="/?table=1"', 'href="#menu"');
   code = code.replaceAll('prod-cart:', 'prod-html-cart:').replaceAll('prod-session:', 'prod-html-session:').replaceAll('prod-pos-cart:', 'prod-html-pos-cart:');
   return code === source ? null : { code, map: null };
 } }],
 build: { outDir: out, emptyOutDir: true, target: ['es2020','safari14'], cssCodeSplit: false, modulePreload: false, assetsInlineLimit: Infinity, chunkSizeWarningLimit: 1000,
  rollupOptions: { input: resolve(root, 'src/html-preview.tsx'), output: { format: 'iife', entryFileNames: 'preview.js', assetFileNames: '[name][extname]' } } },
});
const js = readFileSync(resolve(out, 'preview.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(out, 'style.css'), 'utf8');
const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#6e2917">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; media-src data:; form-action 'none'; base-uri 'none'">
<title>โปรด · ตัวอย่าง HTML</title><style>${css}</style></head><body><div id="root"></div><noscript>ตัวอย่างนี้ใช้ JavaScript เพื่อทดลองเลือกเมนูและหน้าร้าน กรุณาเปิด JavaScript ในเบราว์เซอร์</noscript><script>${js}</script></body></html>`;
writeFileSync(resolve(root, 'preview.html'), html); mkdirSync(resolve(root, 'docs/previews'), { recursive: true });
// Generated build intermediates only; they are not needed to open the HTML.
rmSync(out, { recursive: true, force: true });
console.log('Saved preview.html: ' + Math.round(Buffer.byteLength(html) / 1024) + ' KB; no server, CDN, API, or signup required.');

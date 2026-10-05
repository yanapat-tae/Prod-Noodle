import { activeEntry, persistent, resetPreview, selectEntry } from './api.ts';
import './preview.css';
export default function HtmlPreviewBar({ isStaff }: { isStaff: boolean }) {
  return <div className="html-preview-bar"><span>ตัวอย่าง HTML · ไม่ต้องสมัครบริการ</span><details><summary>สลับหน้าจอ / โต๊ะ</summary><div className="html-preview-controls"><p>ข้อมูลตัวอย่างใน{persistent ? 'เบราว์เซอร์นี้' : 'หน้านี้'} · ไม่ใช่ออเดอร์หรือยอดขายจริง</p><a className="link-button" href={isStaff ? '#menu' : '#admin'}>{isStaff ? 'ดูหน้าลูกค้า' : 'ดู POS / ครัว / ยอดขาย'}</a><label>ลองสั่งที่<select value={activeEntry()} onChange={e => selectEntry(e.target.value)}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={String(i + 1)}>โต๊ะ {i + 1}</option>)}<option value="takeaway">สั่งกลับบ้าน</option></select></label><button onClick={() => { if (confirm('เริ่มข้อมูลตัวอย่างใหม่? ล้างเฉพาะข้อมูลที่ลองใน HTML นี้')) resetPreview(); }}>เริ่มตัวอย่างใหม่</button></div></details></div>;
}

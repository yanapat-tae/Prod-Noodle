import { useRef, useState } from 'react';
import { api } from '../api.ts';
import type { MenuItem, Staff as Identity } from '../domain.ts';
import { money, parseBaht } from '../domain.ts';
import { validateNewMenu, menuGroupTemplates } from '../menu-management.ts';
import '../styles/menu-editor.css';

interface DraftVariant { code: string; name: string; price: string }
interface MenuDraft {
  code: string; name: string; category: string; description: string; unit: string;
  variants: DraftVariant[]; optionGroupCodes: string[]; prepNotes: string;
}

function newDraft(catalog: MenuItem[]): MenuDraft {
  return { code: 'menu-' + crypto.randomUUID(), name: '', category: catalog[0]?.category ?? '', description: '', unit: 'ชาม',
    variants: [{ code: 'normal', name: 'ธรรมดา', price: '' }], optionGroupCodes: [], prepNotes: '' };
}

export default function MenuEditor({ catalog, identity, refresh }: { catalog: MenuItem[]; identity: Identity; refresh: () => Promise<MenuItem[]> }) {
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => newDraft(catalog));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const categories = [...new Map(catalog.map(item => [item.category, item.categoryName])).entries()];
  const groups = [...menuGroupTemplates(catalog).values()];

  function updateVariant(code: string, change: Partial<DraftVariant>) {
    setDraft(previous => ({ ...previous, variants: previous.variants.map(variant => variant.code === code ? { ...variant, ...change } : variant) }));
  }

  async function createMenu() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const input = validateNewMenu({ ...draft,
        variants: draft.variants.map(({ code, name, price }) => ({ code, name, priceSatang: parseBaht(price) })),
        prepNotes: draft.prepNotes.split(/\r?\n/).map(note => note.trim()).filter(Boolean),
      }, catalog);
      await api.createMenu(identity, input);
      const updated = await refresh();
      setDraft(newDraft(updated)); setCreating(false); setNotice('เพิ่มเมนูแล้ว ลูกค้าสามารถสั่งเมนูนี้ได้');
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function saveChanges() {
    if (!selected || submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const values = Object.fromEntries(Object.entries(prices).map(([code, value]) => [code, parseBaht(value)]));
      await api.editMenu(identity, selected.code, values, available);
      await refresh(); setSelected(null); setNotice('บันทึกเมนูแล้ว ออเดอร์เก่าใช้ราคาเดิม');
    } catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }

  function back() { setCreating(false); setSelected(null); setError(''); setNotice(''); }

  return <section className="menu-editor">
    <p className="eyebrow">ตรวจราคาและความพร้อมขาย</p>
    <h1>จัดการเมนู</h1>
    <p className="info-message">เมนูทั้งหมด {catalog.length} รายการ กรุณาตรวจชื่อ ราคา และตัวเลือกก่อนใช้รับออเดอร์จริง</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {notice && <p role="status" className="success-message">{notice}</p>}
    {creating ? <form className="panel" aria-labelledby="new-menu-heading" aria-busy={busy} onSubmit={event => { event.preventDefault(); void createMenu(); }}>
      <h2 id="new-menu-heading">เพิ่มเมนูใหม่</h2>
      <p className="muted">ระบุชื่อ หมวดหมู่ และราคาที่ลูกค้าจะเห็น</p>
      <fieldset className="menu-editor-fields" disabled={busy}>
        <label>ชื่อเมนู<input autoFocus value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} required /></label>
        <div className="menu-editor-grid">
          <label>หมวดหมู่<select value={draft.category} onChange={event => setDraft(previous => ({ ...previous, category: event.target.value }))} required>
            <option value="" disabled>เลือกหมวดหมู่</option>
            {categories.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select></label>
          <label>หน่วยขาย<input value={draft.unit} placeholder="เช่น ชาม จาน ขวด" onChange={event => setDraft(previous => ({ ...previous, unit: event.target.value }))} required /></label>
        </div>
        <label>คำอธิบายเมนู (ไม่บังคับ)<textarea rows={3} value={draft.description} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} /></label>
        <fieldset className="menu-editor-group">
          <legend>ขนาดและราคา</legend>
          <p className="muted">กำหนดได้สูงสุด 8 ขนาด ราคา 0.01–1,000 บาทต่อหน่วย</p>
          {draft.variants.map((variant, index) => <div className="menu-variant-row" key={variant.code}>
            <label>ชื่อขนาด {index + 1}<input value={variant.name} placeholder="เช่น ธรรมดา พิเศษ" onChange={event => updateVariant(variant.code, { name: event.target.value })} required /></label>
            <label>ราคาขนาด {index + 1} (บาท)<input inputMode="decimal" value={variant.price} placeholder="เช่น 50 หรือ 50.50" onChange={event => updateVariant(variant.code, { price: event.target.value })} required /></label>
            {draft.variants.length > 1 && <button type="button" className="danger-text" aria-label={'ลบขนาด ' + (index + 1)} onClick={() => setDraft(previous => ({ ...previous, variants: previous.variants.filter(value => value.code !== variant.code) }))}>ลบขนาด</button>}
          </div>)}
          <button type="button" disabled={draft.variants.length >= 8} onClick={() => setDraft(previous => ({ ...previous, variants: [...previous.variants, { code: 'size-' + crypto.randomUUID(), name: '', price: '' }] }))}>เพิ่มขนาด / ราคา</button>
        </fieldset>
        {groups.length > 0 && <fieldset className="menu-editor-group">
          <legend>ตัวเลือกสำหรับลูกค้า (ไม่บังคับ)</legend>
          <p className="muted">เลือกใช้กลุ่มตัวเลือกที่ร้านมีอยู่ เช่น เส้น น้ำซุป หรือท็อปปิ้ง</p>
          <div className="menu-option-groups">{groups.map(group => <label className="inline-check menu-option-group" key={group.code}>
            <input type="checkbox" checked={draft.optionGroupCodes.includes(group.code)} disabled={!draft.optionGroupCodes.includes(group.code) && draft.optionGroupCodes.length >= 8} onChange={event => {
              const checked = event.target.checked;
              setDraft(previous => ({ ...previous, optionGroupCodes: checked ? [...previous.optionGroupCodes, group.code] : previous.optionGroupCodes.filter(code => code !== group.code) }));
            }} />
            <span><strong>{group.name}</strong><small>{group.min > 0 ? 'ต้องเลือก' : 'เลือกเพิ่มได้'} {group.max === 1 ? '1 อย่าง' : `สูงสุด ${group.max} อย่าง`} · {group.options.map(option => option.name + (option.priceSatang ? ` (+${money(option.priceSatang)})` : '')).join(', ')}</small></span>
          </label>)}</div>
        </fieldset>}
        <label>หมายเหตุที่ลูกค้าเลือกได้ (ไม่บังคับ)<textarea rows={3} aria-describedby="menu-prep-notes-help" value={draft.prepNotes} placeholder={'ไม่ใส่ผัก\nไม่ใส่กระเทียม'} onChange={event => setDraft(previous => ({ ...previous, prepNotes: event.target.value }))} /><span className="muted" id="menu-prep-notes-help">หนึ่งข้อต่อบรรทัด สูงสุด 5 ข้อ ข้อละไม่เกิน 80 ตัวอักษร</span></label>
        <div className="form-actions"><button type="submit" className="primary-action">{busy ? 'กำลังบันทึก…' : 'บันทึกเมนูใหม่'}</button><button type="button" onClick={back}>กลับ</button></div>
      </fieldset>
    </form> : selected ? <form className="panel" aria-busy={busy} onSubmit={event => { event.preventDefault(); void saveChanges(); }}>
      <h2>{selected.name}</h2>
      <fieldset className="menu-editor-fields" disabled={busy}>
        {selected.variants.map(variant => <label key={variant.code}>ราคา{variant.name} (บาท)<input inputMode="decimal" value={prices[variant.code]} onChange={event => setPrices(previous => ({ ...previous, [variant.code]: event.target.value }))} required /></label>)}
        <label className="inline-check menu-availability-check"><input type="checkbox" checked={available} onChange={event => setAvailable(event.target.checked)} />เปิดขายเมนูนี้</label>
        <div className="form-actions"><button type="submit" className="primary-action">{busy ? 'กำลังบันทึก…' : 'บันทึกเมนู'}</button><button type="button" onClick={back}>กลับ</button></div>
      </fieldset>
    </form> : <>
      <button className="primary-action" onClick={() => { setCreating(true); setError(''); setNotice(''); }}>เพิ่มเมนูใหม่</button>
      <div className="inventory-list">{catalog.map(item => <article className="panel inventory-row" key={item.code}>
        <span aria-hidden="true">🍜</span>
        <div><h2>{item.name}</h2><p>{item.variants.map(variant => variant.name + ' ' + money(variant.priceSatang)).join(' / ')}</p><span className={item.available ? 'available' : 'danger-text'}>{item.available ? 'พร้อมขาย' : 'ปิดขายชั่วคราว'}</span></div>
        <button onClick={() => { setSelected(item); setAvailable(item.available); setPrices(Object.fromEntries(item.variants.map(variant => [variant.code, String(variant.priceSatang / 100)]))); setError(''); setNotice(''); }}>แก้ไข</button>
      </article>)}</div>
    </>}
  </section>;
}

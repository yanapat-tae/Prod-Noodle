import { useEffect, useRef, useState } from 'react';
import type { CartInput, Line, MenuItem, Order, SelectedOption } from '../domain.ts';
import { money, priceLine } from '../domain.ts';
interface Props { catalog: MenuItem[]; context: string; storageKey: string; onSubmit: (lines: CartInput[], total: number, key: string) => Promise<Order>; onSubmitted: (order: Order) => void; onRefresh: () => Promise<MenuItem[]>; onExit?: () => void }
export function StickyAction({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { const node = ref.current!; const update = () => document.documentElement.style.setProperty('--bottom-bar-height', node.getBoundingClientRect().height + 'px'); const observer = new ResizeObserver(update); observer.observe(node); update(); return () => observer.disconnect(); }, []);
  return <footer ref={ref} className="sticky-cart">{children}</footer>;
}
function initialCart(key: string): Line[] { try { return JSON.parse(sessionStorage.getItem(key) ?? '{}').cart ?? []; } catch { return []; } }
export default function Ordering({ catalog, context, storageKey, onSubmit, onSubmitted, onRefresh, onExit }: Props) {
  const [cart, setCart] = useState<Line[]>(() => initialCart(storageKey));
  const [view, setView] = useState<'menu' | 'cart'>('menu'); const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<MenuItem | null>(null); const [variant, setVariant] = useState('normal');
  const [options, setOptions] = useState<SelectedOption[]>([]); const [notes, setNotes] = useState<string[]>([]); const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const categoryPicker = useRef<HTMLDetailsElement>(null);
  const request = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => { try { request.current = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}').request ?? null; } catch { /* Empty draft. */ } }, [storageKey]);
  useEffect(() => { sessionStorage.setItem(storageKey, JSON.stringify({ cart, request: request.current })); }, [cart, storageKey]);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, [selected, view]);
  const total = cart.reduce((s, l) => s + l.totalSatang, 0); const count = cart.reduce((s, l) => s + l.quantity, 0);
  const categories = [...new Map(catalog.map(m => [m.category, m.categoryName])).entries()];
  function choose(item: MenuItem) { setSelected(item); setVariant(item.variants[0].code); setQuantity(1); setNotes([]); setError(''); setOptions(item.groups.flatMap(g => g.options.filter(o => o.defaultQuantity).map(o => ({ groupCode: g.code, optionCode: o.code, quantity: 1 })))); }
  function toggle(groupCode: string, optionCode: string, single: boolean) { setOptions(previous => { const exists = previous.some(o => o.groupCode === groupCode && o.optionCode === optionCode); const kept = previous.filter(o => single ? o.groupCode !== groupCode : !(o.groupCode === groupCode && o.optionCode === optionCode)); return single || !exists ? [...kept, { groupCode, optionCode, quantity: 1 }] : kept; }); setError(''); }
  function add() {
    try { const line = priceLine(catalog, { itemCode: selected!.code, variantCode: variant, quantity, options, notes }); setCart(previous => [...previous, line]); setNotice(`เพิ่ม${selected!.name} ${quantity} ${selected!.unit}แล้ว`); setSelected(null); setError(''); }
    catch (e) { setError((e as Error).message); const missing = selected!.groups.find(g => options.filter(o => o.groupCode === g.code).length < g.min); if (missing) document.getElementById('group-' + missing.code)?.focus(); }
  }
  function changeQuantity(id: string, delta: number) { setCart(previous => previous.map(line => line.id === id ? { ...line, quantity: Math.min(20, Math.max(1, line.quantity + delta)), totalSatang: line.unitSatang * Math.min(20, Math.max(1, line.quantity + delta)) } : line)); setError(''); }
  async function submit() {
    if (busy || !cart.length) return; setBusy(true); setError('');
    const inputs = cart.map(({ itemCode, variantCode, quantity, options, notes }) => ({ itemCode, variantCode, quantity, options, notes }));
    const payload = JSON.stringify({ inputs, total }); if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    sessionStorage.setItem(storageKey, JSON.stringify({ cart, request: request.current }));
    try { const order = await onSubmit(inputs, total, request.current.key); setCart([]); request.current = null; sessionStorage.removeItem(storageKey); onSubmitted(order); }
    catch (e) { setError((e as Error).message); await onRefresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  async function recalculate() { try { const fresh = await onRefresh(); const repriced = cart.map(line => ({ ...priceLine(fresh, line), id: line.id })); setCart(repriced); setError(''); setNotice('ตรวจราคาแล้ว กรุณาตรวจยอดก่อนส่งอีกครั้ง'); } catch (e) { setError((e as Error).message); } }
  if (selected) {
    const base = selected.variants.find(v => v.code === variant)!.priceSatang;
    const extra = options.reduce((s, o) => s + (selected.groups.find(g => g.code === o.groupCode)?.options.find(v => v.code === o.optionCode)?.priceSatang ?? 0), 0);
    return <main className="customer-app customer-container bottom-space options-screen">
      <button className="text-back" onClick={() => { setSelected(null); setError(''); }}>← กลับไปเลือกเมนู</button>
      <div className="context-label">{context}</div><span className="detail-emoji" aria-hidden="true">🍜</span>
      <h1 ref={heading} tabIndex={-1}>{selected.name}</h1><p className="supporting-text">เลือกแบบที่ชอบ ก่อนเพิ่มลงตะกร้า</p>
      <fieldset><legend>ขนาดอาหาร <span>เลือก 1 อย่าง</span></legend><div className="option-list">{selected.variants.map(v => <label className="option-control" data-selected={variant === v.code} key={v.code}><input type="radio" name="variant" checked={variant === v.code} onChange={() => setVariant(v.code)} /><span className="choice-copy"><strong>{v.name}</strong><span>{money(v.priceSatang)} {variant === v.code && <em>✓ เลือกแล้ว</em>}</span></span></label>)}</div></fieldset>
      {selected.groups.map(group => <fieldset key={group.code}><legend id={'group-' + group.code} tabIndex={-1}>{group.name}<span>{group.min ? 'เลือก 1 อย่าง' : 'เลือกเพิ่มได้ · ไม่บังคับ'}</span></legend><div className="option-list">{group.options.map(option => { const checked = options.some(o => o.groupCode === group.code && o.optionCode === option.code); return <label key={option.code} className="option-control" data-selected={checked}><input type={group.max === 1 ? 'radio' : 'checkbox'} name={group.code} checked={checked} onChange={() => toggle(group.code, option.code, group.max === 1)} /><span className="choice-copy"><strong>{option.name}</strong><span>{option.priceSatang ? '+' + money(option.priceSatang) : 'ไม่เพิ่มราคา'} {checked && <em>✓ เลือกแล้ว</em>}</span></span></label>; })}</div></fieldset>)}
      {selected.prepNotes.length > 0 && <fieldset><legend>ปรับตามที่ชอบ <span>ไม่บังคับ</span></legend><div className="option-list">{selected.prepNotes.map(note => <label className="option-control" data-selected={notes.includes(note)} key={note}><input type="checkbox" checked={notes.includes(note)} onChange={() => setNotes(previous => previous.includes(note) ? previous.filter(n => n !== note) : [...previous, note])} /><span>{note}{notes.includes(note) && <em> ✓ เลือกแล้ว</em>}</span></label>)}</div></fieldset>}
      <div className="quantity-block"><h2>จำนวน {quantity} {selected.unit}</h2><div className="quantity-controls"><button aria-label="ลดจำนวน" disabled={quantity === 1} onClick={() => setQuantity(q => q - 1)}>−</button><output>{quantity}</output><button aria-label="เพิ่มจำนวน" disabled={quantity === 20} onClick={() => setQuantity(q => q + 1)}>+</button></div></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <StickyAction><button className="primary-action" onClick={add}>เพิ่มลงตะกร้า · {money((base + extra) * quantity)}</button></StickyAction>
    </main>;
  }
  if (view === 'cart') return <main className="customer-app customer-container bottom-space">
    <button className="text-back" onClick={() => { setView('menu'); setError(''); }}>← เลือกอาหารเพิ่ม</button><div className="context-label">{context}</div><h1 ref={heading} tabIndex={-1}>ตรวจรายการอาหาร</h1><p className="supporting-text">เช็กเส้น ขนาด และจำนวน ก่อนส่งให้ร้าน</p>
    {!cart.length && <div className="empty-state"><span aria-hidden="true">🍜</span><h2>ตะกร้ายังว่างอยู่</h2><button className="primary-action" onClick={() => setView('menu')}>กลับไปเลือกเมนู</button></div>}
    {cart.map(line => <article className="cart-line" key={line.id}><div className="cart-title"><h2>{line.name}</h2><strong>{money(line.totalSatang)}</strong></div><p>{[line.variantName, ...line.optionNames, ...line.notes].join(' · ')}</p><div className="cart-line-actions"><div className="quantity-controls"><button aria-label={'ลดจำนวน ' + line.name} disabled={line.quantity === 1} onClick={() => changeQuantity(line.id, -1)}>−</button><output>{line.quantity} {line.unit}</output><button aria-label={'เพิ่มจำนวน ' + line.name} disabled={line.quantity === 20} onClick={() => changeQuantity(line.id, 1)}>+</button></div><button className="remove-action" onClick={() => setCart(previous => previous.filter(l => l.id !== line.id))}>นำออก</button></div></article>)}
    {cart.length > 0 && <div className="bill-total"><span>ยอดรวม {count} รายการ</span><strong>{money(total)}</strong></div>}
    {error && <div className="error-message" role="alert"><p>{error}</p>{error.includes('ราคา') && <button onClick={() => void recalculate()}>ตรวจราคาใหม่</button>}</div>}
    {cart.length > 0 && <StickyAction><button className="primary-action" disabled={busy} onClick={() => void submit()}>{busy ? 'กำลังส่งออเดอร์…' : 'ยืนยันส่งออเดอร์ · ' + money(total)}</button></StickyAction>}
  </main>;
  return <main className={'customer-app customer-container' + (cart.length ? ' bottom-space' : '')}>
    {onExit && <button className="text-back" onClick={onExit}>← กลับไป POS</button>}
    <div className="customer-intro"><div className="context-label"><span className="status-dot" />{context}</div><h1 ref={heading} tabIndex={-1}>เลือกอาหารที่ชอบ</h1><p>แตะเมนู แล้วเลือกเส้นได้เลย</p></div>
    <details ref={categoryPicker} className="category-picker"><summary>หมวดอาหาร · {category === 'all' ? 'ทั้งหมด' : categories.find(c => c[0] === category)?.[1]}</summary><nav className="category-nav" aria-label="หมวดอาหาร"><button className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => { setCategory('all'); categoryPicker.current!.open = false; }}>ทั้งหมด</button>{categories.map(([code, name]) => <button key={code} className={category === code ? 'active' : ''} aria-pressed={category === code} onClick={() => { setCategory(code); categoryPicker.current!.open = false; }}>{name}</button>)}</nav></details>
    <div className="menu-section-heading"><h2>{category === 'all' ? 'เมนูของร้าน' : categories.find(c => c[0] === category)?.[1]}</h2><span className="supporting-text">ราคาเริ่มต้น</span></div>
    <div className="menu-list">{catalog.filter(m => category === 'all' || m.category === category).map(item => <article key={item.code} className={'menu-card' + (!item.available ? ' sold-out' : '')}><div className="menu-card-copy"><span className="menu-placeholder" aria-hidden="true">🍜</span><div><h3 className="menu-title">{item.name}</h3>{item.description && <p className="supporting-text">{item.description}</p>}<strong className="menu-price">{money(item.variants[0].priceSatang)}</strong></div></div><button className="choose-action" disabled={!item.available} onClick={() => choose(item)}>{item.available ? 'เลือกเมนูนี้' : 'เมนูหมดชั่วคราว'}<span aria-hidden="true">{item.available ? ' →' : ''}</span></button></article>)}</div>
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    {cart.length > 0 && <StickyAction><button className="primary-action" onClick={() => setView('cart')}>{`ดูตะกร้า · ${count} รายการ · ${money(total)}`}</button></StickyAction>}
  </main>;
}

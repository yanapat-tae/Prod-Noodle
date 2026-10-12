import { useEffect, useRef, useState } from 'react';
import { RequestFailure } from '../http.ts';
import { api } from '../api.ts';
import { money } from '../domain.ts';
import type { Staff } from '../domain.ts';
import type { SalesHistory as History, SalesDeletion } from '../sales-history.ts';
const recordKey = (record: {kind: string; id: string}) => record.kind + ':' + record.id;
export default function SalesHistory({ identity, onDeleted }: { identity: Staff; onDeleted: () => void }) {
 const [history, setHistory] = useState<History | null>(null), [selected, setSelected] = useState(new Set<string>());
 const [error, setError] = useState(''), [notice, setNotice] = useState(''), [reason, setReason] = useState('');
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
 const [confirmation, setConfirmation] = useState<{payload: SalesDeletion; key: string} | null>(null);
 const inFlight = useRef(false);
 useEffect(() => {
  let alive = true;
  setLoading(true); setError(''); setHistory(null); setSelected(new Set()); setConfirmation(null);
  void api.salesHistory(identity).then(data => { if (alive) setHistory(data); }).catch((e: Error) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
  return () => { alive = false; };
 }, [identity, refresh]);
 const records = history?.records ?? [], chosen = records.filter(r => selected.has(recordKey(r)));
 async function remove() {
  if (!confirmation || inFlight.current) return;
  inFlight.current = true; setBusy(true); setError('');
  try {
   const result = await api.deleteSales(identity, confirmation.payload, confirmation.key);
   setNotice(`ลบประวัติแล้ว ${result.count} รายการ · ยอดขายจะอัปเดตใหม่`); setReason(''); setConfirmation(null);
   onDeleted(); setRefresh(v => v + 1);
  } catch (e) { setError(e instanceof RequestFailure && e.uncertain ? 'ยังยืนยันผลการลบไม่ได้ กรุณาตรวจเน็ต แล้วกดยืนยันอีกครั้ง ระบบจะไม่ลบซ้ำ' : e instanceof Error ? e.message : 'ลบไม่สำเร็จ กรุณาลองใหม่'); }
  finally { inFlight.current = false; setBusy(false); }
 }
 return <article className="panel sales-history"><h2>ลบประวัติยอดขายทดลอง</h2>
  <p className="muted">เฉพาะผู้ดูแลร้าน · แสดงประวัติทุกวัน รวมรายการยังไม่ชำระ · เลือกเฉพาะรายการที่ไม่ได้เกิดขึ้นจริง</p>
  <p>รายการที่ลบจะออกจาก POS ครัว ยอดขาย และ CSV ระบบเก็บผู้ลบกับเหตุผลไว้ตรวจสอบ การลบนี้ไม่มีการคืนเงินจริง</p>
  {notice && <p role="status" className="info-message">{notice}</p>}
  {error && <p role="alert" className="error-message">{error}</p>}
  {loading ? <p role="status">กำลังโหลดประวัติ…</p> : <>
   <button disabled={busy} onClick={() => setRefresh(v => v + 1)}>โหลดประวัติใหม่</button>
   {history && (records.length ? <>
    <label className="sales-select-all"><input type="checkbox" disabled={busy || Boolean(confirmation)} checked={selected.size === records.length} onChange={e => setSelected(new Set(e.target.checked ? records.map(recordKey) : []))} />เลือกทั้งหมด {records.length} รายการที่แสดง</label>
    <div className="sales-records">{records.map(r => <label className="sales-record" key={recordKey(r)}>
     <input type="checkbox" disabled={busy || Boolean(confirmation)} checked={selected.has(recordKey(r))} onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(recordKey(r)); else next.delete(recordKey(r)); return next; })} />
     <span><strong>{r.label}</strong><small>{new Date(r.date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })} · {r.paid ? 'ชำระแล้ว' : 'ยังไม่ชำระ'} · #{r.id.slice(0,8)}</small><span>{r.detail}</span></span><strong>{money(r.totalSatang)}</strong>
    </label>)}</div>
    <p>เลือก {chosen.length} รายการ · มูลค่ารายการรวม {money(chosen.reduce((sum,r) => sum + r.totalSatang,0))}</p>
    <label>เหตุผลการลบ<textarea disabled={busy || Boolean(confirmation)} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ทดลองกดก่อนเปิดใช้งานจริง" /></label>
    {!confirmation && <button className="danger-action" disabled={!chosen.length || !reason.trim() || busy} onClick={() => { setError(''); setConfirmation({ key: crypto.randomUUID(), payload: { records: chosen.map(({kind,id,version}) => ({kind,id,version})), reason: reason.trim() } }); }}>ลบรายการที่เลือก</button>}
   </> : <p>ไม่มีประวัติยอดขายให้ลบ</p>)}
  </>}
  {confirmation && <div role="alertdialog" aria-labelledby="sales-delete-title" aria-describedby="sales-delete-description" className="sales-confirmation">
   <h3 id="sales-delete-title">ยืนยันลบ {confirmation.payload.records.length} รายการ</h3>
   <p id="sales-delete-description">ลบเฉพาะรายการที่เลือกไว้ ยอดที่เกี่ยวข้องจะไม่นับในรายงาน และไม่มีการคืนเงินจริง</p>
   <p>เหตุผล: {confirmation.payload.reason}</p>
   <div className="form-actions"><button disabled={busy} onClick={() => { setConfirmation(null); setError(''); }}>กลับไปตรวจรายการ</button><button className="danger-action" disabled={busy} onClick={() => void remove()}>{busy ? 'กำลังลบ…' : 'ยืนยันลบประวัติ'}</button></div>
  </div>}
 </article>;
}

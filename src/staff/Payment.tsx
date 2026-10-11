import { useRef, useState } from 'react';
import { api } from '../api.ts';
import type { Order, Staff } from '../domain.ts';
import { money, orderLabel, paymentMethodNames, thaiTime } from '../domain.ts';
import { billRounds } from '../bill-payment.ts';
import type { BillPaymentInput, BillReceipt } from '../bill-payment.ts';
import { RequestFailure } from '../http.ts';
interface Pending { anchor: Order; key: string; input: BillPaymentInput; rounds: Order[] }
export default function Payment({ identity, anchor, orders, onBack, onPaid }: { identity: Staff; anchor: Order; orders: Order[]; onBack: () => void; onPaid: (receipt: BillReceipt) => void }) {
  const storageKey = 'prod-bill-payment:' + identity.id + ':' + (anchor.visitId ?? anchor.id);
  const saved = (): Pending | null => { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); } catch { return null; } };
  const [pending, setPending] = useState<Pending | null>(saved);
  const [rounds, setRounds] = useState(() => saved()?.rounds ?? billRounds(orders,anchor));
  const [method, setMethod] = useState(() => saved()?.input.method ?? 'cash');
  const [confirmed, setConfirmed] = useState(!!saved());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sending = useRef(false);
  const due = rounds.filter(o => !o.paidAt);
  const total = due.reduce((sum,o) => sum+o.totalSatang,0);
  async function submit() {
    if (sending.current || (!pending && (total <= 0 || (method !== 'cash' && !confirmed)))) return;
    const request = pending ?? { anchor, key:crypto.randomUUID(), input:{method,confirmed:true,expectedOrderIds:due.map(o=>o.id),expectedTotalSatang:total}, rounds };
    sending.current = true; setBusy(true); setError('');
    sessionStorage.setItem(storageKey,JSON.stringify(request)); setPending(request);
    try {
      const receipt = await api.payBill(identity,anchor.id,request.input,request.key);
      if (!receipt.id || receipt.totalSatang !== request.input.expectedTotalSatang || receipt.orders.length !== request.input.expectedOrderIds.length || receipt.orders.some(o => !o.paidAt || !request.input.expectedOrderIds.includes(o.id))) throw new Error('ยังยืนยันใบรับเงินไม่ได้ กรุณาลองรายการเดิมอีกครั้ง');
      sessionStorage.removeItem(storageKey); setPending(null); onPaid(receipt);
    } catch (e) {
      if (e instanceof RequestFailure && !e.uncertain) { sessionStorage.removeItem(storageKey); setPending(null); }
      setError((e as Error).message);
    } finally { sending.current = false; setBusy(false); }
  }
  async function reload() {
    if (sending.current || pending) return;
    sending.current = true; setBusy(true);
    try { const state = await api.state(identity); setRounds(billRounds(state.orders,anchor)); setError(''); setConfirmed(false); }
    catch (e) { setError((e as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  return <main className="staff-container payment-screen">
    <button disabled={busy} onClick={onBack}>← กลับไปออเดอร์</button>
    <h1>รับชำระเงิน · {orderLabel(anchor)}</h1>
    <div className="panel">
      <p className="muted">บิล #{(anchor.visitId ?? anchor.id).slice(0,8).toUpperCase()} · รวมทุกรอบในบิลนี้</p>
      {rounds.map((order,index) => <section key={order.id} className="bill-round">
        <h2>รอบที่ {index+1} · {thaiTime(order.createdAt)}</h2>
        {order.lines.map(line => <div className="receipt-line" key={line.id}><span>{line.quantity} × {line.name}</span><strong>{money(line.totalSatang)}</strong></div>)}
        <p>{order.paidAt ? 'ชำระแล้ว · ' + (paymentMethodNames[order.paymentMethod ?? ''] ?? order.paymentMethod) : 'ยังไม่ชำระ'} · {money(order.totalSatang)}</p>
      </section>)}
      <div className="bill-total"><span>ยอดที่ต้องชำระทุกรอบ</span><strong>{money(total)}</strong></div>
      <p className="info-message">บันทึกหลังแคชเชียร์รับเงินหรือตรวจรายการโอนแล้ว การเลือกวิธีชำระไม่ได้ยืนยันเงินเข้าธนาคาร</p>
      <div className="payment-methods" role="group" aria-label="ช่องทางชำระเงิน">
        {['cash','promptpay','thai_chuay_thai'].map(value => <button key={value} disabled={busy || !!pending} aria-pressed={method===value} className={method===value?'active':''} onClick={() => { setMethod(value); setConfirmed(false); }}>{paymentMethodNames[value]}</button>)}
      </div>
      {method !== 'cash' && <label className="inline-check"><input type="checkbox" checked={confirmed} disabled={busy || !!pending} onChange={e=>setConfirmed(e.target.checked)} />ตรวจยอด {paymentMethodNames[method]} เข้าจริงแล้ว</label>}
      {pending && !busy && <p className="info-message" role="status">รายการนี้ยังรอยืนยัน กดลองยืนยันรายการเดิมเพื่อรับใบรับเงินโดยไม่ชำระซ้ำ</p>}
      <button className="primary-action" disabled={busy || (!pending && (total<=0 || (method!=='cash'&&!confirmed)))} onClick={()=>void submit()}>{busy?'กำลังบันทึก…':pending?'ลองยืนยันรายการเดิมอีกครั้ง':method==='cash'?'รับเงินสดแล้ว':'ยืนยันรับชำระเงิน'}</button>
      {error && <p role="alert" className="error-message">{error}</p>}
      {!pending && <button disabled={busy} onClick={()=>void reload()}>โหลดบิลล่าสุด</button>}
    </div>
  </main>;
}

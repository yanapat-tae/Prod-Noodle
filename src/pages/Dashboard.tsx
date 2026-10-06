import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.ts';
import { businessDate, csvCell, money, salesReport } from '../domain.ts';
import type { Staff } from '../domain.ts';
const colors = ['#6e2917', '#2f6653', '#b88535', '#597891'];
interface ReportResult { requestId: string; report: ReturnType<typeof salesReport> | null; error: string }
export default function Dashboard({ identity }: { identity: Staff }) {
  const [date, setDate] = useState(businessDate()); const [monthly, setMonthly] = useState(false);
  const [revision, setRevision] = useState(0); const [result, setResult] = useState<ReportResult | null>(null);
  const period = monthly ? date.slice(0, 7) : date;
  const requestId = `${identity.id}:${period}:${revision}`;
  // Bind data and errors to the selected period and refresh, even before effects run.
  const current = result?.requestId === requestId ? result : null;
  const report = current?.report ?? null;
  const error = !period ? 'กรุณาเลือกวันที่' : current?.error ?? '';
  const loading = Boolean(period) && !current;
  useEffect(() => {
    setResult(null);
    if (!period) return;
    let alive = true;
    void api.report(identity, period).then(data => {
      if (alive) setResult({ requestId, report: data, error: '' });
    }).catch((e: unknown) => {
      if (alive) setResult({ requestId, report: null, error: e instanceof Error && e.message ? e.message : 'โหลดรายงานไม่สำเร็จ' });
    });
    return () => { alive = false; };
  }, [identity, period, requestId]);
  function exportCsv() { if (!report) return; const rows = [['ช่วงเวลา', 'ช่องทาง', 'ยอดหลังส่วนลดก่อนคืนเงิน (บาท)'], ...report.channels.map(c => [period, c.name, (c.value / 100).toFixed(2)]), ['รวมคืนเงิน', '', (report.refund / 100).toFixed(2)], ['ยอดสุทธิ', '', (report.net / 100).toFixed(2)], ['จำนวนออเดอร์ชำระครบ', '', report.count ?? 'ข้อมูลไม่ครบ']]; const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `prod-sales-${period}.csv`; link.click(); URL.revokeObjectURL(link.href); }
  return <section className="dashboard"><div className="section-top"><div><p className="eyebrow">มองยอดร้านได้ในที่เดียว</p><h1>ภาพรวมยอดขาย</h1></div><div className="filter-actions"><label>วันที่ <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="inline-check"><input type="checkbox" checked={monthly} onChange={e => setMonthly(e.target.checked)} />รวมทั้งเดือน</label><button disabled={loading || !period} onClick={() => setRevision(value => value + 1)}>↻ อัปเดตยอด</button><button className="primary-action" disabled={!report} onClick={exportCsv}>ส่งออก CSV</button></div></div><p className="muted">นับยอดเมื่อชำระครบ · วันที่และเวลาไทย · อัปเดตเมื่อเปิดหน้า หรือกดอัปเดตยอด</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {!report ? loading && <p role="status">กำลังโหลดรายงาน…</p> : <><div className="kpi-grid"><article><span>ยอดขายสุทธิ</span><strong>{money(report.net)}</strong><small>คืนเงิน {money(report.refund)}</small></article><article><span>ออเดอร์ชำระครบ</span><strong>{report.count === null ? 'ข้อมูลไม่ครบ' : report.count.toLocaleString('th-TH')}</strong><small>นับหนึ่งครั้งต่อออเดอร์</small></article><article><span>เฉลี่ยต่อออเดอร์</span><strong>{report.average === null ? '—' : money(report.average)}</strong><small>หลังส่วนลด ก่อนคืนเงิน</small></article><article><span>เมนูขายดี</span><strong className="top-menu-name">{report.top[0]?.name ?? 'ยังไม่มีรายการ'}</strong><small>{report.top[0] ? report.top[0].quantity + ' หน่วยที่ขาย' : 'แสดงเมื่อมีออเดอร์ชำระแล้ว'}</small></article></div>
      {report.hasDailySummary && <p className="info-message">ยอด Delivery แบบสรุปรายวันรวมในยอดขายแล้ว แต่ไม่มีรายละเอียดชั่วโมงและเมนู สัดส่วนยอดที่มีรายละเอียด {report.gross ? Math.round(report.detailGross / report.gross * 100) : 0}%</p>}
      <div className="chart-grid"><article className="panel"><h2>ยอดขายตามเวลาชำระ</h2><p className="muted">เฉพาะออเดอร์ที่มีรายละเอียด · หน่วยบาท</p>{report.detailGross ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.hourly}><CartesianGrid vertical={false} stroke="#e8e1d5" /><XAxis dataKey="hour" tick={{ fontSize: 12 }} interval={3} /><YAxis width={60} tick={{ fontSize: 12 }} /><Tooltip formatter={value => [Number(value).toLocaleString('th-TH') + ' บาท', 'ยอดขาย']} /><Bar dataKey="value" fill="#6e2917" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="chart-empty">ยังไม่มียอดขายละเอียดในช่วงนี้</div>}</article><article className="panel"><h2>ช่องทางขาย</h2><p className="muted">หลังส่วนลด ก่อนคืนเงิน</p>{report.gross ? <div className="chart donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={report.channels.filter(c => c.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={4}>{report.channels.filter(c => c.value > 0).map(c => <Cell key={c.channel} fill={colors[report.channels.findIndex(v => v.channel === c.channel)]} />)}</Pie><Tooltip formatter={v => money(Number(v))} /></PieChart></ResponsiveContainer></div> : <div className="chart-empty">ยังไม่มียอดขายในช่วงนี้</div>}<div className="channel-legend">{report.channels.map((c, i) => <div key={c.channel}><span className="legend-dot" style={{ background: colors[i] }} /><span>{c.name}</span><strong>{money(c.value)}</strong></div>)}</div></article></div>
      <article className="panel"><h2>10 เมนูขายดี</h2><p className="muted">จำนวนที่ขายจากออเดอร์ชำระครบ · ไม่รวมยอด Delivery ที่ไม่มีรายการอาหาร</p>{report.top.length ? <ol className="top-menu-list">{report.top.map((item, i) => <li key={item.name}><span className="rank">{i + 1}</span><span>{item.name}</span><div className="rank-bar"><div style={{ width: item.quantity / report.top[0].quantity * 100 + '%' }} /></div><strong>{item.quantity}</strong></li>)}</ol> : <div className="chart-empty">เมนูขายดีจะแสดงเมื่อชำระออเดอร์แรก</div>}</article>
    </>}
  </section>;
}

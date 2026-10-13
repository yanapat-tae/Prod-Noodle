import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { Staff } from '../domain.ts';
import { serviceUsageReport, usageProgress } from '../service-usage.ts';
import type { RawServiceUsage, UsageMetric } from '../service-usage.ts';
import '../styles/service-usage.css';

function amount(value: number, unit: UsageMetric['unit']): string {
  if (unit === 'count') return value.toLocaleString('th-TH');
  return value >= 1_000_000_000 ? (value / 1_000_000_000).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' GB' : (value / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' MB';
}
const dateTime = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

function UsageCard({ metric }: { metric: UsageMetric }) {
  const progress = usageProgress(metric);
  const percent = progress.percent === null ? null : Number(progress.percent.toFixed(2));
  const status = metric.status === 'unlimited' ? 'ไม่จำกัดจำนวนครั้ง' : metric.status === 'not_used' ? 'เว็บนี้ไม่ได้ใช้' : percent === null ? 'ยังไม่มีข้อมูล' : progress.severity === 'danger' ? 'ใกล้เต็มหรือเกินโควตา' : progress.severity === 'warning' ? 'ควรตรวจการใช้โควตา' : 'ยังมีโควตาเหลือ';
  return <article className={'usage-card usage-' + progress.severity} data-metric={metric.id}>
    <div className="usage-card-heading"><h3>{metric.label}</h3>{percent !== null && <strong className="usage-percent">{percent}%</strong>}</div>
    {percent !== null && <>
      <p className="usage-amount">{amount(metric.used!, metric.unit)} / {amount(metric.limit!, metric.unit)}</p>
      <div className="usage-track" role="progressbar" aria-label={metric.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)} aria-valuetext={'ใช้ไป ' + percent + '% · ' + status}>
        <span style={{ width: progress.barPercent + '%' }} />
      </div>
      <p className="usage-remaining">เหลือ {amount(progress.remaining!, metric.unit)}</p>
    </>}
    {percent === null && metric.limit !== null && <p className="usage-amount">โควตา {amount(metric.limit, metric.unit)}</p>}
    <p className="usage-state">{status}</p>
    {metric.stale && <p className="usage-stale">ข้อมูลเก่า · เก็บไว้เกิน 24 ชั่วโมงแล้ว</p>}
    <p>{metric.period}</p>
    {metric.note && <p className="usage-note">{metric.note}</p>}
    <p className="usage-source">แหล่งข้อมูล: {metric.source}<br />{metric.updatedAt ? 'วัดเมื่อ ' + dateTime(metric.updatedAt) + ' (เวลาไทย)' : 'ยังไม่มีเวลาที่วัดการใช้จริง'}</p>
  </article>;
}

export default function ServiceUsage({ identity }: { identity: Staff }) {
  const [raw, setRaw] = useState<RawServiceUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await api.serviceUsage(identity);
      if (generation.current === version) { setRaw(result); setClock(new Date()); }
    } catch (cause) {
      if (generation.current === version) setError(cause instanceof Error ? cause.message : 'ยังโหลดข้อมูลไม่ได้');
    } finally { if (generation.current === version) setLoading(false); }
  }, [identity]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  // Only recompute age/month boundaries. This timer makes no network requests.
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const report = raw ? serviceUsageReport(raw, clock) : null;
  return <section className="service-usage" aria-busy={loading}>
    <div className="usage-toolbar"><div><h1>การใช้โควตา</h1><p>ดูพื้นที่และโควตาของระบบร้าน · แพลน Free</p></div><button onClick={() => void load()} disabled={loading}>{loading ? 'กำลังโหลด…' : 'โหลดข้อมูลล่าสุด'}</button></div>
    {error && <p className="error-message" role="alert">โหลดใหม่ไม่สำเร็จ: {error}{raw && ' · ยังแสดงข้อมูลครั้งก่อน'}</p>}
    {report?.demo && <p className="usage-demo">ข้อมูลตัวอย่าง · ไม่ใช่ Usage ของร้านจริง</p>}
    {report?.checkedAt && <p className="usage-last-loaded">โหลดข้อมูลเมื่อ {dateTime(report.checkedAt)} (เวลาไทย)</p>}
    <p className="usage-explanation">พื้นที่สะสมไม่รีเซ็ตทุกเดือน ส่วนโควตารายเดือนดูตามรอบที่ระบุ ค่าจากผู้ให้บริการอาจอัปเดตช้า ให้ดูเวลาที่วัดแต่ละรายการด้วย</p>
    {report?.providers.map(provider => <section className="usage-provider" key={provider.id} aria-label={provider.name}>
      <div className="usage-provider-heading"><h2>{provider.name}</h2><a className="link-button" href={provider.href} target="_blank" rel="noreferrer">เปิดรายงาน {provider.name} ↗</a></div>
      {provider.id === 'cloudflare' && <p>ค่าของ Cloudflare เป็นข้อมูลที่เก็บล่าสุดตามเวลาที่แสดง การโหลดหน้านี้ใหม่ไม่ได้อัปเดตรายงานของผู้ให้บริการทันที</p>}
      <div className="usage-grid">{provider.metrics.map(metric => <UsageCard metric={metric} key={metric.id} />)}</div>
    </section>)}
    {loading && !raw && <p role="status">กำลังโหลดการใช้โควตา…</p>}
    <p className="usage-footnote">MB และ GB ในหน้านี้ใช้หน่วยฐานสิบ · แถบสีเตือนที่ 80% และ 95% · รายการที่ยังไม่มีข้อมูลจะไม่แสดงเป็น 0%</p>
  </section>;
}

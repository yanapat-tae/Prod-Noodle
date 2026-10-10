import { useState } from 'react';
import { api } from '../api.ts';
import type { DeliverySummary, Staff as Identity } from '../domain.ts';
import { businessDate, channelNames, money, parseBaht, validateSummary } from '../domain.ts';

export default function Delivery({
  identity,
  summaries,
  refresh,
}: {
  identity: Identity;
  summaries: DeliverySummary[];
  refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(businessDate());
  const [channel, setChannel] = useState<'grabfood' | 'lineman'>('grabfood');
  const [gross, setGross] = useState('');
  const [discount, setDiscount] = useState('0');
  const [refund, setRefund] = useState('0');
  const [count, setCount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(values: DeliverySummary[]) {
    if (
      values.some((v) => summaries.some((s) => s.date === v.date && s.channel === v.channel)) &&
      !confirm('มีข้อมูลช่องทางและวันที่นี้อยู่แล้ว ต้องการใช้ยอดใหม่แทนยอดเดิมใช่ไหม?')
    )
      return;
    setBusy(true);
    try {
      values.forEach(validateSummary);
      await api.delivery(identity, values);
      await refresh();
      setMessage('บันทึกยอดแล้ว ไม่มีการบวกซ้ำสำหรับช่องทางและวันเดิม');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importCsv(file: File) {
    try {
      const lines = (await file.text())
        .replace(/^\uFEFF/, '')
        .trim()
        .split(/\r?\n/);
      if (lines[0] !== 'date,channel,gross,discount,refund,order_count')
        throw new Error('หัว CSV ต้องเป็น date,channel,gross,discount,refund,order_count');
      const values = lines
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const cells = line.split(',');
          if (cells.length !== 6)
            throw new Error('CSV ต้องมี 6 คอลัมน์ และใช้ตัวเลขไม่คั่นหลักพัน');
          return {
            date: cells[0],
            channel: cells[1] as DeliverySummary['channel'],
            grossSatang: parseBaht(cells[2]),
            discountSatang: parseBaht(cells[3]),
            refundSatang: parseBaht(cells[4]),
            orderCount: cells[5] === '' ? null : /^\d+$/.test(cells[5]) ? Number(cells[5]) : NaN,
          };
        });
      await save(values);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section>
      <p className="eyebrow">เริ่มจากยอดสรุปที่ตรวจได้</p>
      <h1>ยอด Delivery</h1>
      <p className="muted">บันทึกยอดขายก่อนหักค่าธรรมเนียม ไม่ใช่ยอดโอนเข้าบัญชี</p>
      {identity.role === 'owner' && (
        <form
          className="panel delivery-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              void save([
                {
                  date,
                  channel,
                  grossSatang: parseBaht(gross),
                  discountSatang: parseBaht(discount),
                  refundSatang: parseBaht(refund),
                  orderCount: count === '' ? null : /^\d+$/.test(count) ? Number(count) : NaN,
                },
              ]);
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          <div className="form-grid">
            <label>
              วันที่
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              ช่องทาง
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
              >
                <option value="grabfood">GrabFood</option>
                <option value="lineman">LINE MAN</option>
              </select>
            </label>
            <label>
              ยอดก่อนส่วนลด (บาท)
              <input
                inputMode="decimal"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                required
              />
            </label>
            <label>
              ส่วนลด (บาท)
              <input
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                required
              />
            </label>
            <label>
              คืนเงิน (บาท)
              <input
                inputMode="decimal"
                value={refund}
                onChange={(e) => setRefund(e.target.value)}
                required
              />
            </label>
            <label>
              จำนวนออเดอร์
              <input
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="เว้นว่างหากไม่ทราบ"
              />
            </label>
          </div>
          <button className="primary-action" disabled={busy}>
            บันทึกยอดรายวัน
          </button>
          <div className="csv-import">
            <label>
              หรือนำเข้า CSV
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importCsv(file);
                  e.target.value = '';
                }}
              />
            </label>
            <a href="/delivery-template.csv" download>
              ดาวน์โหลดตัวอย่าง CSV
            </a>
          </div>
        </form>
      )}
      {message && (
        <p className="info-message" role="status">
          {message}
        </p>
      )}
      <div className="panel table-overflow">
        <table>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ช่องทาง</th>
              <th>ยอดสุทธิ</th>
              <th>ออเดอร์</th>
            </tr>
          </thead>
          <tbody>
            {[...summaries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => (
                <tr key={s.date + s.channel}>
                  <td>{s.date}</td>
                  <td>{channelNames[s.channel]}</td>
                  <td>{money(s.grossSatang - s.discountSatang - s.refundSatang)}</td>
                  <td>{s.orderCount ?? 'ไม่ทราบ'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!summaries.length && <p className="muted">ยังไม่มีข้อมูล Delivery</p>}
      </div>
    </section>
  );
}

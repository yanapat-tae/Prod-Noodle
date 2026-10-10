import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, mode } from '../api.ts';
import type { Staff } from '../domain.ts';
import type { QrEntry } from './qr.ts';
type Card = QrEntry & { image: string };
const cards = (entries: QrEntry[]) =>
  Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      image: await QRCode.toDataURL(entry.url, {
        width: 360,
        margin: 3,
        errorCorrectionLevel: 'M',
      }),
    })),
  );
export default function QrCards({ identity }: { identity: Staff }) {
  const [codes, setCodes] = useState<Card[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false),
    requests = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      setCodes(await cards(await api.qr(identity)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [identity]);
  useEffect(() => {
    void load();
  }, [load]);
  async function rotate(code: Card) {
    if (
      inFlight.current ||
      !confirm(
        `เปลี่ยน QR สำหรับ ${code.label} เท่านั้น? QR เดิมของจุดนี้จะสแกนเริ่มสั่งไม่ได้ ออเดอร์ที่บันทึกแล้วจะยังอยู่`,
      )
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const request = code.key + ':' + code.revision;
    if (!requests.current.has(request)) requests.current.set(request, crypto.randomUUID());
    try {
      const updated = await api.rotateQr(identity, code, requests.current.get(request)!);
      const [card] = await cards([updated]);
      setCodes((previous) => previous.map((value) => (value.key === card.key ? card : value)));
      requests.current.delete(request);
      setNotice(`เปลี่ยน QR ${code.label} แล้ว กรุณาใช้รูปหรือลิงก์ใหม่ของใบนี้`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function copy(code: Card) {
    try {
      await navigator.clipboard.writeText(code.url);
      setNotice('คัดลอกลิงก์ ' + code.label + ' แล้ว');
      setError('');
    } catch {
      setError('คัดลอกอัตโนมัติไม่ได้ กรุณาแตะเลือกข้อความในช่องลิงก์แล้วคัดลอก');
    }
  }
  return (
    <section aria-busy={busy}>
      <p className="eyebrow">QR เดิมใช้ซ้ำได้ ทั้งหน้าร้านและส่งใน LINE</p>
      <h1>QR สั่งอาหาร 10 จุด</h1>
      <p className="muted">
        เปิดดู ดาวน์โหลด และคัดลอกได้โดย QR ไม่เปลี่ยน หากต้องการเปลี่ยน ให้กด “เปลี่ยน QR ใบนี้”
        เฉพาะจุดที่ต้องการ
      </p>
      {mode === 'demo' && (
        <p className="info-message">
          QR ตัวอย่างในเครื่องนี้ การยกเลิก QR เก่าใช้งานจริงในระบบออนไลน์
        </p>
      )}
      <button disabled={busy} onClick={() => void load()}>
        {busy ? 'กำลังโหลด…' : 'โหลด QR เดิม'}
      </button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      <div className="qr-grid">
        {codes.map((code) => (
          <article className="panel" key={code.key}>
            <h2>{code.label}</h2>
            <img src={code.image} width="240" height="240" alt={'QR สำหรับ ' + code.label} />
            <a className="link-button" href={code.url} target="_blank" rel="noreferrer">
              เปิดหน้าสั่งอาหาร
            </a>
            <a href={code.image} download={'prod-qr-' + code.key + '.png'}>
              ดาวน์โหลด QR
            </a>
            <label>
              ลิงก์สั่งอาหาร
              <input
                aria-label={'ลิงก์ ' + code.label}
                readOnly
                value={code.url}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <button onClick={() => void copy(code)}>คัดลอกลิงก์</button>
            <button className="danger-text" disabled={busy} onClick={() => void rotate(code)}>
              เปลี่ยน QR ใบนี้
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

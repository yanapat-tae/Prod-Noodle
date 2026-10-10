import { useEffect, useState } from 'react';
import { api, mode } from '../api.ts';
import type { Staff as Identity } from '../domain.ts';

export default function Accounts({ identity }: { identity: Identity }) {
  const [accounts, setAccounts] = useState<
    { id: string; name: string; role: string; active: boolean; slot: number }[]
  >([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .accounts(identity)
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, [identity.id]);
  return (
    <section>
      <p className="eyebrow">บัญชีร้านทั้งหมด 4 ช่อง</p>
      <h1>บัญชีพนักงาน</h1>
      <p className="info-message">
        {mode === 'demo'
          ? 'บัญชีทดลองใช้รหัส 1234 เหมือนกัน ใช้เฉพาะโหมดบนเครื่อง บัญชีจริงต้องสร้างใน Supabase Auth'
          : 'ข้อมูลบัญชีอ่านจาก Supabase Auth profile การตั้งรหัสผ่านใช้หน้าจัดการ Auth ของเจ้าของโปรเจกต์'}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="account-grid">
        {accounts.map((account) => (
          <article className="panel" key={account.id}>
            <span className="account-number">0{account.slot}</span>
            <h2>{account.name}</h2>
            <p>{account.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</p>
            <span className="status-badge">{account.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

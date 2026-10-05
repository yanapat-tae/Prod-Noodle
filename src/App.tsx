import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, mode } from './api.ts';
import type { MenuItem } from './domain.ts';
import Customer from './pages/Customer.tsx';
const Staff = lazy(() => import('./pages/Staff.tsx'));
export default function App() {
  const [catalog, setCatalog] = useState<MenuItem[]>([]); const [error, setError] = useState(''); const isStaff = location.pathname.startsWith('/admin');
  const refreshMenu = useCallback(async () => { const menu = await api.menu(); setCatalog(menu); setError(''); return menu; }, []);
  useEffect(() => { void refreshMenu().catch(e => setError(e.message)); }, [refreshMenu]);
  return <><div className={'mode-bar ' + (mode === 'demo' ? 'demo' : '')}>{mode === 'demo' ? <><span>โหมดทดลองบนเครื่อง · ไม่ใช่ออเดอร์จริง</span><a href={isStaff ? '/?table=1' : '/admin'}>{isStaff ? 'เปิดหน้าลูกค้า ↗' : 'หน้าร้าน / POS ↗'}</a></> : <><span>โปรด · สั่งอาหารกับร้าน</span>{!isStaff && <a href="/admin">พนักงาน</a>}</>}</div>{!isStaff && <header className="brand-header"><a href={location.pathname + location.search} className="brand"><span className="brand-mark" aria-hidden="true">🍜</span><span><strong>โปรด</strong><small>ก๋วยเตี๋ยวหมูโบราณ</small></span></a><span className="brand-note">อร่อย อบอุ่น<br />ทุกชามที่โปรด</span></header>}{error ? <main className="customer-app customer-container"><h1>ยังโหลดเมนูไม่ได้</h1><p className="error-message" role="alert">{error}</p><button onClick={() => void refreshMenu().catch(e => setError(e.message))}>ลองอีกครั้ง</button></main> : !catalog.length ? <main className="customer-app customer-container"><p role="status">กำลังเปิดร้าน…</p></main> : isStaff ? <Suspense fallback={<main className="staff-container"><p role="status">กำลังเปิดหลังร้าน…</p></main>}><Staff catalog={catalog} refreshMenu={refreshMenu} /></Suspense> : <Customer catalog={catalog} refreshMenu={refreshMenu} />}</>;
}

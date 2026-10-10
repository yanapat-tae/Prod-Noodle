import { useCallback, useEffect, useRef, useState } from 'react';
import QrCards from '../staff/QrCards.tsx';
import Ticket from '../staff/Ticket.tsx';
import Delivery from '../staff/Delivery.tsx';
import Accounts from '../staff/Accounts.tsx';
import { StaffStateSync, emptyStaffState } from '../staff/state-sync.ts';
import { StaffSoundPlayer } from '../staff/sounds.ts';
import type { StaffSound } from '../staff/sounds.ts';
import { api, mode } from '../api.ts';
import type { StaffState } from '../api.ts';
import type { MenuItem, Order, Staff as Identity, Status } from '../domain.ts';
import { money, orderLabel, statusNames } from '../domain.ts';
import Ordering from './Ordering.tsx';
import Dashboard from './Dashboard.tsx';
import MenuEditor from './MenuEditor.tsx';
type Tab = 'pos' | 'kitchen' | 'dashboard' | 'delivery' | 'menu' | 'qr' | 'accounts';
const tabs: [Tab, string][] = [
  ['pos', 'โต๊ะ / POS'],
  ['kitchen', 'ห้องครัว'],
  ['dashboard', 'ยอดขาย'],
  ['delivery', 'Delivery'],
  ['menu', 'จัดการเมนู'],
  ['qr', 'QR โต๊ะ'],
  ['accounts', 'บัญชีร้าน'],
];
const emptyState = emptyStaffState();
export default function Staff({
  catalog,
  refreshMenu,
}: {
  catalog: MenuItem[];
  refreshMenu: () => Promise<MenuItem[]>;
}) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [account, setAccount] = useState(mode === 'demo' ? 'demo-1' : '');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<StaffState>(emptyState);
  const [tab, setTab] = useState<Tab>('pos');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [compose, setCompose] = useState<{
    channel: 'dine_in' | 'takeaway';
    table: number | null;
  } | null>(null);
  const [payment, setPayment] = useState<Order | null>(null);
  const [sound, setSound] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const paidSounds = useRef(new Set<string>());
  const actionInFlight = useRef(false);
  const [sounds] = useState(() => new StaffSoundPlayer());
  const [soundError, setSoundError] = useState('');
  const sessionSync = useRef<StaffStateSync | null>(null);
  const soundRequest = useRef(0);
  const playSound = useCallback(
    (kind: StaffSound) => {
      void sounds.play(kind).then((ok) => {
        if (!ok) {
          sounds.disable();
          setSound(false);
          setSoundError('เสียงหยุดทำงาน กรุณาแตะเปิดเสียงอีกครั้ง');
        }
      });
    },
    [sounds],
  );
  const observeOrders = useCallback(
    (orders: Order[], snapshot: boolean) => {
      if (!known.current) {
        if (snapshot) known.current = new Set(orders.map((order) => order.id));
        return;
      }
      const incoming = orders.some(
        (order) => !known.current!.has(order.id) && !['served', 'cancelled'].includes(order.status),
      );
      orders.forEach((order) => known.current!.add(order.id));
      if (incoming) playSound('order');
    },
    [playSound],
  );
  useEffect(
    () => () => {
      soundRequest.current++;
      sounds.dispose();
    },
    [sounds],
  );
  const refresh = useCallback(async (changed?: Order) => {
    if (changed) sessionSync.current?.accept(changed);
    else await sessionSync.current?.refresh();
  }, []);
  useEffect(() => {
    let alive = true;
    void api
      .restoreStaff()
      .then((value) => {
        if (alive) setIdentity(value);
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!identity) return;
    known.current = null;
    paidSounds.current.clear();
    const sync = new StaffStateSync(
      () => api.state(identity),
      (value, changed) => {
        observeOrders(changed ? [changed] : value.orders, !changed);
        setState(value);
      },
      (error) => setError((error as Error).message),
    );
    sessionSync.current = sync;
    void sync.refresh();
    const stop = api.watch(identity, (changed) => {
      if (changed) sync.accept(changed);
      else void sync.refresh();
    });
    const visible = () => {
      if (!document.hidden) void sync.refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      sync.dispose();
      sessionSync.current = null;
      stop();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [identity, observeOrders]);

  async function toggleSound() {
    const request = ++soundRequest.current;
    if (sound) {
      sounds.disable();
      setSound(false);
      return;
    }
    const enabled = await sounds.enable();
    if (request !== soundRequest.current) return;
    setSound(enabled);
    setSoundError(enabled ? '' : 'เปิดเสียงไม่ได้ กรุณาลองแตะอีกครั้งหรือเปิดเว็บใน Safari');
  }
  async function logout() {
    soundRequest.current++;
    sounds.disable();
    setSound(false);
    setBusy(true);
    try {
      await api.logout(identity!);
      sessionSync.current?.dispose();
      setIdentity(null);
      setState(emptyState);
      setPayment(null);
      setCompose(null);
      setError('');
      setNotice('');
      setSoundError('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    setError('');
    try {
      setIdentity(await api.login(account, password));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(order: Order, kind: string, value?: string) {
    if (actionInFlight.current) return;
    if (kind === 'payment') {
      setPayment(order);
      return;
    }
    if (
      (kind === 'refund' || value === 'cancelled') &&
      !confirm(
        kind === 'refund'
          ? `คืนเงิน ${money(order.totalSatang)} สำหรับ ${orderLabel(order)} ใช่ไหม?`
          : `ยกเลิกออเดอร์ ${orderLabel(order)} ใช่ไหม?`,
      )
    )
      return;
    actionInFlight.current = true;
    setBusy(true);
    setError('');
    if (kind === 'pay') void sounds.prepare();
    try {
      if (kind === 'status') await refresh(await api.status(identity!, order.id, value as Status));
      else if (kind === 'refund') await refresh(await api.refund(identity!, order.id));
      else {
        const paid = await api.pay(identity!, order.id, value!);
        if (paid.id !== order.id || !paid.paidAt)
          throw new Error('ยังไม่ได้รับการยืนยันบันทึกเงิน กรุณาโหลดออเดอร์ใหม่');
        await refresh(paid);
        if (!order.paidAt && !paid.refundedAt && !paidSounds.current.has(paid.id)) {
          paidSounds.current.add(paid.id);
          playSound('payment');
        }
      }
      setPayment(null);
      setNotice('บันทึกแล้ว');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  async function closeTable(table: number) {
    if (!confirm(`ปิดรอบโต๊ะ ${table} และเริ่มรอบใหม่สำหรับลูกค้ากลุ่มถัดไป?`)) return;
    setBusy(true);
    try {
      await api.close(identity!, table);
      await refresh();
      setNotice(`ปิดโต๊ะ ${table} แล้ว`);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (restoring)
    return (
      <main className="staff-container">
        <p role="status">กำลังตรวจบัญชี…</p>
      </main>
    );
  if (!identity)
    return (
      <main className="login-screen">
        <div className="login-card">
          <span className="login-emoji" aria-hidden="true">
            🍜
          </span>
          <p className="eyebrow">โปรด · หลังร้าน</p>
          <h1>เข้าสู่ระบบร้าน</h1>
          <p className="muted">จัดการโต๊ะ ห้องครัว และยอดขาย</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <label>
              {mode === 'demo' ? 'บัญชีทดลอง' : 'อีเมลพนักงาน'}
              {mode === 'demo' ? (
                <select value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="demo-1">เจ้าของร้าน</option>
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={'demo-' + n}>
                      พนักงาน {n - 1}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="email"
                  autoComplete="username"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  required
                />
              )}
            </label>
            <label>
              {mode === 'demo' ? 'รหัสทดลอง: 1234' : 'รหัสผ่าน'}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="primary-action" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
          <a href="/?table=1">← กลับหน้าสั่งอาหาร</a>
        </div>
      </main>
    );
  if (compose)
    return (
      <Ordering
        isTakeaway={compose.channel === 'takeaway'}
        catalog={catalog}
        context={compose.table ? `POS · โต๊ะ ${compose.table}` : 'POS · สั่งกลับบ้าน'}
        storageKey={'prod-pos-cart:' + identity.id + ':' + compose.table}
        onRefresh={refreshMenu}
        onExit={() => setCompose(null)}
        onSubmit={(lines, total, key, takeaway) =>
          api.posOrder(identity, lines, total, compose.channel, compose.table, key, takeaway)
        }
        onSubmitted={(order) => {
          setCompose(null);
          setFilter(order.tableNumber ? String(order.tableNumber) : 'takeaway');
          setNotice('เปิดออเดอร์ ' + orderLabel(order) + ' แล้ว');
          void refresh();
        }}
      />
    );
  if (payment)
    return (
      <main className="staff-container payment-screen">
        <button disabled={busy} onClick={() => setPayment(null)}>
          ← กลับไปออเดอร์
        </button>
        <h1>รับชำระเงิน · {orderLabel(payment)}</h1>
        <div className="panel">
          {payment.lines.map((l) => (
            <div className="receipt-line" key={l.id}>
              <span>
                {l.quantity} × {l.name}
              </span>
              <strong>{money(l.totalSatang)}</strong>
            </div>
          ))}
          <div className="bill-total">
            <span>ยอดที่ต้องชำระ</span>
            <strong>{money(payment.totalSatang)}</strong>
          </div>
          <p className="info-message">บันทึกหลังแคชเชียร์รับเงินหรือตรวจรายการโอนแล้ว</p>
          <div className="payment-methods">
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => void action(payment, 'pay', 'cash')}
            >
              รับเงินสดแล้ว
            </button>
            <button disabled={busy} onClick={() => void action(payment, 'pay', 'promptpay')}>
              ตรวจยอด PromptPay แล้ว
            </button>
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  const activeOrders = state.orders.filter((o) => !['served', 'cancelled'].includes(o.status));
  const visibleOrders = state.orders.filter((o) =>
    filter === 'all'
      ? o.status !== 'cancelled' &&
        (!o.paidAt ||
          o.status !== 'served' ||
          Boolean(o.visitId && state.visits[o.tableNumber!]?.id === o.visitId))
      : filter === 'takeaway'
        ? o.channel === 'takeaway' &&
          (o.status !== 'served' || !o.paidAt) &&
          o.status !== 'cancelled'
        : o.tableNumber === Number(filter) && o.visitId === state.visits[filter]?.id,
  );
  return (
    <div className="staff-app">
      <header className="staff-topbar">
        <div>
          <strong>
            โปรด <span>หลังร้าน</span>
          </strong>
          <p>
            {identity.name} · {identity.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}
          </p>
        </div>
        <div>
          <button aria-pressed={sound} disabled={busy} onClick={() => void toggleSound()}>
            {sound ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
          </button>
          <button disabled={busy} onClick={() => void logout()}>
            ออกจากระบบ
          </button>
        </div>
      </header>
      <nav className="staff-nav" aria-label="หน้าจอร้าน">
        {tabs
          .filter(([key]) => identity.role === 'owner' || !['menu', 'qr', 'accounts'].includes(key))
          .map(([key, label]) => (
            <button
              className={tab === key ? 'active' : ''}
              aria-current={tab === key ? 'page' : undefined}
              key={key}
              onClick={() => {
                setTab(key);
                setError('');
              }}
            >
              {label}
              {key === 'kitchen' && activeOrders.length > 0 && <span>{activeOrders.length}</span>}
            </button>
          ))}
      </nav>
      <main className="staff-container">
        <section className="sound-controls" aria-label="เสียงแจ้งเตือน">
          <p>
            {sound
              ? 'เปิดเสียงแล้ว · กระดิ่ง = ออเดอร์เข้า / เสียงไล่โน้ต = รับเงินแล้ว'
              : 'เปิดเสียงแจ้งเตือน เพื่อฟังออเดอร์เข้าและการรับเงิน'}
          </p>
          {sound && (
            <div>
              <button onClick={() => playSound('order')}>ลองเสียงออเดอร์เข้า</button>
              <button onClick={() => playSound('payment')}>ลองเสียงรับเงิน</button>
            </div>
          )}
          <p className="muted">ปรับเสียงสื่อของเครื่องให้ดังพอ และเปิดหน้านี้ไว้ขณะใช้งาน</p>
          {soundError && (
            <p role="alert" className="error-message">
              {soundError}
            </p>
          )}
        </section>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {notice}
        </p>
        {tab === 'pos' && (
          <>
            <div className="section-top">
              <div>
                <p className="eyebrow">รับลูกค้า ดูโต๊ะ คิดเงิน</p>
                <h1>โต๊ะและออเดอร์</h1>
              </div>
              <button
                className="primary-action"
                onClick={() => setCompose({ channel: 'takeaway', table: null })}
              >
                + เปิดออเดอร์กลับบ้าน
              </button>
            </div>
            <div className="table-grid">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((table) => {
                const visit = state.visits[table];
                const orders = state.orders.filter(
                  (o) => o.visitId === visit?.id && o.tableNumber === table,
                );
                const due = orders
                  .filter((o) => !o.paidAt && o.status !== 'cancelled')
                  .reduce((s, o) => s + o.totalSatang, 0);
                return (
                  <button
                    key={table}
                    className={
                      'table-card ' +
                      (visit ? 'occupied' : 'free') +
                      (filter === String(table) ? ' selected' : '')
                    }
                    onClick={() => {
                      setFilter(String(table));
                      if (!visit) setCompose({ channel: 'dine_in', table });
                    }}
                  >
                    <span>โต๊ะ {table}</span>
                    <strong>{visit ? 'เปิดโต๊ะอยู่' : 'โต๊ะว่าง'}</strong>
                    <small>{visit ? 'ค้างชำระ ' + money(due) : 'แตะเพื่อเปิดออเดอร์'}</small>
                  </button>
                );
              })}
            </div>
            <div className="order-filters">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                ทั้งหมด
              </button>
              <button
                className={filter === 'takeaway' ? 'active' : ''}
                onClick={() => setFilter('takeaway')}
              >
                กลับบ้าน
              </button>
              {/^\d+$/.test(filter) && (
                <>
                  <span>โต๊ะ {filter}</span>
                  <button onClick={() => setCompose({ channel: 'dine_in', table: Number(filter) })}>
                    + เพิ่มออเดอร์โต๊ะนี้
                  </button>
                  {state.visits[filter] && (
                    <button disabled={busy} onClick={() => void closeTable(Number(filter))}>
                      ปิดรอบโต๊ะ
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="ticket-grid">
              {[...visibleOrders]
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((order) => (
                  <Ticket
                    key={order.id}
                    order={order}
                    identity={identity}
                    busy={busy}
                    onAction={(...args) => void action(...args)}
                  />
                ))}
            </div>
            {!visibleOrders.length && (
              <div className="empty-state">
                <span aria-hidden="true">🍜</span>
                <h2>ยังไม่มีออเดอร์ในกลุ่มนี้</h2>
                <p>ออเดอร์จากลูกค้าจะแสดงที่นี่</p>
              </div>
            )}
          </>
        )}
        {tab === 'kitchen' && (
          <>
            <div className="section-top">
              <div>
                <p className="eyebrow">ทำตามคิว ส่งมอบให้ครบ</p>
                <h1>
                  ห้องครัว <span className="count-pill">{activeOrders.length}</span>
                </h1>
              </div>
              <button onClick={() => void refresh()}>↻ โหลดใหม่</button>
            </div>
            <div className="kitchen-columns">
              {(['new', 'preparing', 'ready'] as Status[]).map((status) => (
                <section key={status}>
                  <h2>
                    {statusNames[status]}{' '}
                    <span>{activeOrders.filter((o) => o.status === status).length}</span>
                  </h2>
                  {activeOrders
                    .filter((o) => o.status === status)
                    .map((order) => (
                      <Ticket
                        key={order.id}
                        order={order}
                        identity={identity}
                        busy={busy}
                        onAction={(...args) => void action(...args)}
                      />
                    ))}
                  {!activeOrders.some((o) => o.status === status) && (
                    <p className="column-empty">ไม่มีรายการ</p>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
        {tab === 'dashboard' && <Dashboard identity={identity} />}
        {tab === 'delivery' && (
          <Delivery identity={identity} summaries={state.summaries} refresh={() => refresh()} />
        )}
        {tab === 'menu' && (
          <MenuEditor catalog={catalog} identity={identity} refresh={refreshMenu} />
        )}
        {tab === 'qr' && <QrCards identity={identity} />}
        {tab === 'accounts' && <Accounts identity={identity} />}
      </main>
    </div>
  );
}

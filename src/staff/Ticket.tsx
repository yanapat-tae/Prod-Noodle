import type { Order, Staff as Identity } from '../domain.ts';
import { canTransition, money, orderLabel, statusNames, thaiTime } from '../domain.ts';
import { DeliveryDetails } from '../pages/TakeawayForm.tsx';

export default function Ticket({
  order,
  identity,
  busy,
  onAction,
}: {
  order: Order;
  identity: Identity;
  busy: boolean;
  onAction: (order: Order, action: string, value?: string) => void;
}) {
  const target = canTransition(order.status, 'served') ? 'served' : undefined;
  return (
    <article className={'ticket status-border-' + order.status}>
      <div className="ticket-top">
        <div>
          <h2>{orderLabel(order)}</h2>
          <span className="muted">
            #{order.id.slice(0, 6).toUpperCase()} · {thaiTime(order.createdAt)}
          </span>
        </div>
        <span className={'status-badge status-' + order.status}>{statusNames[order.status]}</span>
      </div>
      <DeliveryDetails details={order.takeaway} />
      <div className="ticket-lines">
        {order.lines.map((line) => (
          <div key={line.id}>
            <div>
              <strong>
                {line.quantity} × {line.name}
              </strong>
              <span>{money(line.totalSatang)}</span>
            </div>
            <p>{[line.variantName, ...line.optionNames, ...line.notes].join(' · ')}</p>
            {line.freeNote && <p className="kitchen-note">{line.freeNote}</p>}
          </div>
        ))}
      </div>
      <div className="ticket-total">
        <span>{order.refundedAt ? 'คืนเงินแล้ว' : order.paidAt ? '✓ ชำระแล้ว' : 'ยังไม่ชำระ'}</span>
        <strong>{money(order.totalSatang)}</strong>
      </div>
      <div className="ticket-actions">
        {target && (
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => onAction(order, 'status', target)}
          >
            เสร็จ/เสิร์ฟแล้ว
          </button>
        )}
        {!order.paidAt && order.status !== 'cancelled' && (
          <button disabled={busy} onClick={() => onAction(order, 'payment')}>
            รับชำระเงิน
          </button>
        )}
        {canTransition(order.status, 'cancelled') && (
          <button
            className="danger-text"
            disabled={busy}
            onClick={() => onAction(order, 'status', 'cancelled')}
          >
            ยกเลิก
          </button>
        )}
        {identity.role === 'owner' && order.paidAt && !order.refundedAt && (
          <button className="danger-text" disabled={busy} onClick={() => onAction(order, 'refund')}>
            คืนเงินเต็มจำนวน
          </button>
        )}
      </div>
    </article>
  );
}

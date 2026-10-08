import type { TakeawayDetails } from '../domain.ts';
import { villageName } from '../domain.ts';
import '../styles/takeaway.css';

export default function TakeawayForm({ value, onChange, disabled }: { value: TakeawayDetails; onChange: (value: TakeawayDetails) => void; disabled: boolean }) {
  const update = (patch: Partial<TakeawayDetails>) => onChange({ ...value, ...patch });
  return <fieldset className="takeaway-form" disabled={disabled}>
    <legend>ข้อมูลผู้รับอาหาร</legend>
    <label>ชื่อผู้สั่ง<input autoComplete="name" value={value.customerName} onChange={e => update({ customerName: e.target.value })} placeholder="ชื่อเล่นก็ได้" required /></label>
    <label className="option-control" data-selected={value.villageDelivery}><input type="checkbox" checked={value.villageDelivery} onChange={e => update({ villageDelivery: e.target.checked })} /><span>ส่งใน{villageName}</span></label>
    {value.villageDelivery ? <><label>บ้านเลขที่ / ซอย<textarea rows={2} autoComplete="street-address" value={value.deliveryAddress} onChange={e => update({ deliveryAddress: e.target.value })} placeholder="เช่น 12/3 ซอย 2" required /></label><label>เบอร์ติดต่อ<input type="tel" autoComplete="tel" value={value.deliveryPhone} onChange={e => update({ deliveryPhone: e.target.value })} required /></label><p className="supporting-text">ร้านใช้ข้อมูลนี้ติดต่อและจัดส่งอาหารในหมู่บ้าน</p></> : <p className="supporting-text">รับอาหารที่ร้านตามชื่อและเลขคิว</p>}
  </fieldset>;
}

export function DeliveryDetails({ details }: { details?: TakeawayDetails | null }) {
  if (!details?.villageDelivery) return null;
  return <div className="delivery-details"><strong>จัดส่ง · {villageName}</strong><p>{details.deliveryAddress}</p><p>โทร {details.deliveryPhone}</p></div>;
}

import { useEffect, useId, useRef, useState } from 'react';
import type { CartInput, MenuItem, SelectedOption } from '../domain.ts';
import { money, priceLine, selectionLimits } from '../domain.ts';
import { defaultCopy } from '../menu-admin.ts';
import { StickyAction } from './StickyAction.tsx';

interface Props {
  item: MenuItem;
  context?: string;
  onAdd: (input: CartInput) => void;
  onBack?: () => void;
  preview?: boolean;
}
export default function MenuOptions({ item, context, onAdd, onBack, preview = false }: Props) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [variant, setVariant] = useState(item.variants[0].code);
  const [options, setOptions] = useState<SelectedOption[]>(() =>
    item.groups
      .filter((g) => g.enabled !== false)
      .flatMap((g) =>
        g.options
          .filter((o) => o.enabled !== false && o.defaultQuantity)
          .map((o) => ({ groupCode: g.code, optionCode: o.code, quantity: 1 })),
      ),
  );
  const [notes, setNotes] = useState<string[]>([]),
    [freeNote, setFreeNote] = useState('');
  const [quantity, setQuantity] = useState(1),
    [error, setError] = useState('');
  useEffect(() => {
    if (!preview) {
      window.scrollTo(0, 0);
      heading.current?.focus();
    }
  }, [preview]);
  const copy = { ...defaultCopy, ...item.copy };
  const base = item.variants.find((v) => v.code === variant)!.priceSatang;
  const extra = options.reduce(
    (sum, selected) =>
      sum +
      (item.groups
        .find((g) => g.code === selected.groupCode)
        ?.options.find((o) => o.code === selected.optionCode)?.priceSatang ?? 0),
    0,
  );
  function toggle(groupCode: string, optionCode: string, single: boolean) {
    setOptions((previous) => {
      const exists = previous.some((o) => o.groupCode === groupCode && o.optionCode === optionCode);
      const kept = previous.filter((o) =>
        single
          ? o.groupCode !== groupCode
          : !(o.groupCode === groupCode && o.optionCode === optionCode),
      );
      return exists ? kept : [...kept, { groupCode, optionCode, quantity: 1 }];
    });
    setError('');
  }
  function add() {
    const input = { itemCode: item.code, variantCode: variant, quantity, options, notes, freeNote };
    try {
      priceLine([item], input);
      onAdd(input);
      setError('');
    } catch (error) {
      setError((error as Error).message);
      const invalid = item.groups.find((g) => {
        const count = options.filter((o) => o.groupCode === g.code).length;
        const { min, max } = selectionLimits(g, variant);
        return g.enabled !== false && (count < min || count > max);
      });
      if (invalid) document.getElementById(id + '-' + invalid.code)?.focus();
    }
  }
  const action = (
    <button type="button" className="primary-action" onClick={add}>
      {preview ? 'ลองเพิ่มรายการ' : 'เพิ่มลงตะกร้า'} · {money((base + extra) * quantity)}
    </button>
  );
  return (
    <section
      className={
        'customer-app customer-container options-screen' +
        (preview ? ' menu-preview' : ' bottom-space')
      }
    >
      {onBack && (
        <button type="button" className="text-back" onClick={onBack}>
          ← กลับไปเลือกเมนู
        </button>
      )}
      {context && <div className="context-label">{context}</div>}
      <span className="detail-emoji" aria-hidden="true">
        🍜
      </span>
      <h1 ref={heading} tabIndex={-1}>
        {item.name}
      </h1>
      <p className="supporting-text">{copy.instructions}</p>
      <fieldset>
        <legend>
          {copy.variantLabel} <span>เลือก 1 อย่าง</span>
        </legend>
        <div className="option-list">
          {item.variants.map((v) => (
            <label className="option-control" data-selected={variant === v.code} key={v.code}>
              <input
                type="radio"
                name={id + '-variant'}
                checked={variant === v.code}
                onChange={() => {
                  setVariant(v.code);
                  setError('');
                }}
              />
              <span className="choice-copy">
                <strong>{v.name}</strong>
                <span>
                  {money(v.priceSatang)} {variant === v.code && <em>✓ เลือกแล้ว</em>}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {item.groups
        .filter((g) => g.enabled !== false)
        .map((group) => {
          const { min, max } = selectionLimits(group, variant);
          const count = options.filter((o) => o.groupCode === group.code).length;
          const instruction =
            min === max
              ? `เลือก ${min} อย่าง`
              : min
                ? `เลือก ${min}–${max} อย่าง`
                : `เลือกได้สูงสุด ${max} อย่าง · ไม่บังคับ`;
          return (
            <fieldset key={group.code}>
              <legend id={id + '-' + group.code} tabIndex={-1}>
                {group.name}
                <span>
                  {instruction} · เลือกแล้ว {count}
                </span>
              </legend>
              <div className="option-list">
                {group.options
                  .filter((o) => o.enabled !== false)
                  .map((option) => {
                    const checked = options.some(
                      (o) => o.groupCode === group.code && o.optionCode === option.code,
                    );
                    return (
                      <label className="option-control" data-selected={checked} key={option.code}>
                        <input
                          type={min === 1 && max === 1 ? 'radio' : 'checkbox'}
                          name={id + '-' + group.code}
                          checked={checked}
                          onChange={() => toggle(group.code, option.code, max === 1)}
                        />
                        <span className="choice-copy">
                          <strong>{option.name}</strong>
                          <span>
                            {option.priceSatang ? '+' + money(option.priceSatang) : 'ไม่เพิ่มราคา'}{' '}
                            {checked && <em>✓ เลือกแล้ว</em>}
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
          );
        })}
      {item.prepNotes.length > 0 && (
        <fieldset>
          <legend>
            ปรับตามที่ชอบ <span>ไม่บังคับ</span>
          </legend>
          <div className="option-list">
            {item.prepNotes.map((note) => (
              <label className="option-control" data-selected={notes.includes(note)} key={note}>
                <input
                  type="checkbox"
                  checked={notes.includes(note)}
                  onChange={() =>
                    setNotes((previous) =>
                      previous.includes(note)
                        ? previous.filter((n) => n !== note)
                        : [...previous, note],
                    )
                  }
                />
                <span>
                  {note}
                  {notes.includes(note) && <em> ✓ เลือกแล้ว</em>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="free-note-field">
        {copy.notesLabel}
        <textarea
          value={freeNote}
          onChange={(event) => setFreeNote(event.target.value)}
          rows={3}
          placeholder={copy.notesPlaceholder}
          aria-describedby={id + '-note-hint'}
        />
        <small id={id + '-note-hint'}>
          ไม่บังคับ · ไม่เกิน 300 ตัวอักษร · ถ้าต้องการเพิ่มอาหารให้เลือกตัวเลือกเพิ่ม
        </small>
      </label>
      <div className="quantity-block">
        <h2>
          จำนวน {quantity} {item.unit}
        </h2>
        <div className="quantity-controls">
          <button
            type="button"
            aria-label="ลดจำนวน"
            disabled={quantity === 1}
            onClick={() => setQuantity((q) => q - 1)}
          >
            −
          </button>
          <output>{quantity}</output>
          <button
            type="button"
            aria-label="เพิ่มจำนวน"
            disabled={quantity === 20}
            onClick={() => setQuantity((q) => q + 1)}
          >
            +
          </button>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {preview ? action : <StickyAction>{action}</StickyAction>}
    </section>
  );
}

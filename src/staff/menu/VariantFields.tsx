import type { MenuDraft } from './draft.ts';
import { move } from './draft.ts';
export default function VariantFields({
  draft,
  onChange,
}: {
  draft: MenuDraft;
  onChange: (draft: MenuDraft) => void;
}) {
  const variants = draft.variants;
  function remove(code: string) {
    onChange({
      ...draft,
      variants: variants.filter((v) => v.code !== code),
      groups: draft.groups.map((g) => ({
        ...g,
        limitsByVariant: Object.fromEntries(
          Object.entries(g.limitsByVariant ?? {}).filter(([key]) => key !== code),
        ),
      })),
    });
  }
  return (
    <fieldset className="menu-editor-group">
      <legend>ขนาดและราคา</legend>
      <p className="muted">กำหนดได้สูงสุด 8 แบบ ราคา 0.01–1,000 บาทต่อหน่วย</p>
      {variants.map((v, i) => (
        <div className="menu-variant-row" key={v.code}>
          <label>
            ชื่อขนาด {i + 1}
            <input
              value={v.name}
              onChange={(e) =>
                onChange({
                  ...draft,
                  variants: variants.map((item, j) =>
                    j === i ? { ...item, name: e.target.value } : item,
                  ),
                })
              }
              required
            />
          </label>
          <label>
            ราคาขนาด {i + 1} (บาท)
            <input
              inputMode="decimal"
              value={v.price}
              onChange={(e) =>
                onChange({
                  ...draft,
                  variants: variants.map((item, j) =>
                    j === i ? { ...item, price: e.target.value } : item,
                  ),
                })
              }
              required
            />
          </label>
          <div className="menu-row-actions">
            <button
              type="button"
              aria-label={'เลื่อนขนาด ' + (i + 1) + ' ขึ้น'}
              disabled={i === 0}
              onClick={() => onChange({ ...draft, variants: move(variants, i, -1) })}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={'เลื่อนขนาด ' + (i + 1) + ' ลง'}
              disabled={i === variants.length - 1}
              onClick={() => onChange({ ...draft, variants: move(variants, i, 1) })}
            >
              ↓
            </button>
            <button
              type="button"
              className="danger-text"
              disabled={variants.length === 1}
              onClick={() => remove(v.code)}
            >
              ลบขนาด {i + 1}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={variants.length >= 8}
        onClick={() =>
          onChange({
            ...draft,
            variants: [...variants, { code: 'size-' + crypto.randomUUID(), name: '', price: '' }],
          })
        }
      >
        เพิ่มขนาด / ราคา
      </button>
    </fieldset>
  );
}

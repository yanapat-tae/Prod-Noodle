import type { Group } from '../../domain.ts';
import type { DraftGroup, MenuDraft } from './draft.ts';
import { draftGroup, move, newOption } from './draft.ts';
export default function GroupFields({
  draft,
  templates,
  onChange,
}: {
  draft: MenuDraft;
  templates: Group[];
  onChange: (draft: MenuDraft) => void;
}) {
  function update(index: number, change: Partial<DraftGroup>) {
    onChange({
      ...draft,
      groups: draft.groups.map((g, i) => (i === index ? { ...g, ...change } : g)),
    });
  }
  return (
    <fieldset className="menu-editor-group">
      <legend>ตัวเลือกและเพิ่มพิเศษ</legend>
      <p className="muted">
        แก้เฉพาะเมนูนี้ เลือกขั้นต่ำ 0 เพื่อให้ลูกค้าไม่ใส่ก็ได้ ราคาเพิ่มเป็นบาท
      </p>
      {draft.groups.map((group, i) => (
        <details className="menu-group-editor" key={group.code} open>
          <summary>
            กลุ่ม {i + 1} · {group.name || 'กลุ่มใหม่'}
            {group.enabled === false ? ' · ปิดใช้งาน' : ''}
          </summary>
          <label>
            ชื่อกลุ่ม {i + 1}
            <input
              value={group.name}
              onChange={(e) => update(i, { name: e.target.value })}
              required
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={group.enabled !== false}
              onChange={(e) => update(i, { enabled: e.target.checked })}
            />
            เปิดกลุ่ม {i + 1}
          </label>
          <div className="menu-editor-grid">
            <label>
              ขั้นต่ำกลุ่ม {i + 1}
              <input
                type="number"
                min="0"
                max="20"
                value={group.min}
                onChange={(e) => update(i, { min: Number(e.target.value) })}
              />
            </label>
            <label>
              สูงสุดกลุ่ม {i + 1}
              <input
                type="number"
                min="0"
                max="20"
                value={group.max}
                onChange={(e) => update(i, { max: Number(e.target.value) })}
              />
            </label>
          </div>
          <details
            className="menu-size-limits"
            open={Object.keys(group.limitsByVariant ?? {}).length > 0}
          >
            <summary>กำหนดจำนวนแยกตามขนาด</summary>
            {draft.variants.map((v) => {
              const bound = group.limitsByVariant?.[v.code];
              return (
                <div key={v.code}>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={!!bound}
                      onChange={(e) =>
                        update(i, {
                          limitsByVariant: e.target.checked
                            ? {
                                ...group.limitsByVariant,
                                [v.code]: { min: group.min, max: group.max },
                              }
                            : Object.fromEntries(
                                Object.entries(group.limitsByVariant ?? {}).filter(
                                  ([key]) => key !== v.code,
                                ),
                              ),
                        })
                      }
                    />
                    กำหนดเฉพาะ {v.name || 'ขนาดใหม่'} กลุ่ม {i + 1}
                  </label>
                  {bound && (
                    <div className="menu-editor-grid">
                      <label>
                        ขั้นต่ำ {v.name} กลุ่ม {i + 1}
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={bound.min}
                          onChange={(e) =>
                            update(i, {
                              limitsByVariant: {
                                ...group.limitsByVariant,
                                [v.code]: { ...bound, min: Number(e.target.value) },
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        สูงสุด {v.name} กลุ่ม {i + 1}
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={bound.max}
                          onChange={(e) =>
                            update(i, {
                              limitsByVariant: {
                                ...group.limitsByVariant,
                                [v.code]: { ...bound, max: Number(e.target.value) },
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </details>
          {group.options.map((option, j) => {
            const label = `${i + 1}.${j + 1}`;
            const change = (value: Partial<typeof option>) =>
              update(i, {
                options: group.options.map((o, index) => (index === j ? { ...o, ...value } : o)),
              });
            return (
              <fieldset className="menu-option-editor" key={option.code}>
                <legend>ตัวเลือก {label}</legend>
                <div className="menu-editor-grid">
                  <label>
                    ชื่อตัวเลือก {label}
                    <input
                      value={option.name}
                      onChange={(e) => change({ name: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    ราคาตัวเลือก {label} (บาท)
                    <input
                      inputMode="decimal"
                      value={option.price}
                      onChange={(e) => change({ price: e.target.value })}
                      required
                    />
                  </label>
                </div>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={option.enabled !== false}
                    onChange={(e) =>
                      change({
                        enabled: e.target.checked,
                        defaultQuantity: e.target.checked ? option.defaultQuantity : 0,
                      })
                    }
                  />
                  เปิดตัวเลือก {label}
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={!!option.defaultQuantity}
                    disabled={option.enabled === false}
                    onChange={(e) => change({ defaultQuantity: e.target.checked ? 1 : 0 })}
                  />
                  เลือกไว้เริ่มต้น {label}
                </label>
                <div className="menu-row-actions">
                  <button
                    type="button"
                    aria-label={'เลื่อนตัวเลือก ' + label + ' ขึ้น'}
                    disabled={j === 0}
                    onClick={() => update(i, { options: move(group.options, j, -1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={'เลื่อนตัวเลือก ' + label + ' ลง'}
                    disabled={j === group.options.length - 1}
                    onClick={() => update(i, { options: move(group.options, j, 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    disabled={group.options.length === 1}
                    onClick={() =>
                      update(i, { options: group.options.filter((o) => o.code !== option.code) })
                    }
                  >
                    ลบตัวเลือก {label}
                  </button>
                </div>
              </fieldset>
            );
          })}
          <button
            type="button"
            disabled={group.options.length >= 20}
            onClick={() => update(i, { options: [...group.options, newOption()] })}
          >
            เพิ่มตัวเลือกในกลุ่ม {i + 1}
          </button>
          <div className="menu-row-actions">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => onChange({ ...draft, groups: move(draft.groups, i, -1) })}
            >
              เลื่อนกลุ่ม {i + 1} ขึ้น
            </button>
            <button
              type="button"
              disabled={i === draft.groups.length - 1}
              onClick={() => onChange({ ...draft, groups: move(draft.groups, i, 1) })}
            >
              เลื่อนกลุ่ม {i + 1} ลง
            </button>
            <button
              type="button"
              className="danger-text"
              onClick={() =>
                onChange({ ...draft, groups: draft.groups.filter((g) => g.code !== group.code) })
              }
            >
              ลบกลุ่ม {i + 1}
            </button>
          </div>
        </details>
      ))}
      <div className="menu-row-actions">
        <button
          type="button"
          disabled={draft.groups.length >= 8}
          onClick={() => onChange({ ...draft, groups: [...draft.groups, draftGroup()] })}
        >
          เพิ่มกลุ่มตัวเลือก
        </button>
      </div>
      <label>
        คัดลอกกลุ่มที่ร้านมีอยู่
        <select
          value=""
          disabled={draft.groups.length >= 8}
          onChange={(e) => {
            const group = templates.find((g) => g.code === e.target.value);
            if (group)
              onChange({
                ...draft,
                groups: [
                  ...draft.groups,
                  draftGroup({
                    ...group,
                    limitsByVariant: Object.fromEntries(
                      Object.entries(group.limitsByVariant ?? {}).filter(([code]) =>
                        draft.variants.some((v) => v.code === code),
                      ),
                    ),
                  }),
                ],
              });
          }}
        >
          <option value="">เลือกกลุ่มเพื่อคัดลอก</option>
          {templates
            .filter((g) => !draft.groups.some((current) => current.code === g.code))
            .map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
        </select>
      </label>
    </fieldset>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { MenuItem, Staff as Identity } from '../domain.ts';
import { money, priceLine } from '../domain.ts';
import { publicCatalog, menuRequestSignature } from '../menu-admin.ts';
import type { MenuAdminCatalog, MenuMutation } from '../menu-admin.ts';
import { menuGroupTemplates } from '../menu-management.ts';
import { RequestFailure } from '../http.ts';
import { definitionFromDraft, editDraft, move, newDraft } from '../staff/menu/draft.ts';
import type { MenuDraft } from '../staff/menu/draft.ts';
import VariantFields from '../staff/menu/VariantFields.tsx';
import GroupFields from '../staff/menu/GroupFields.tsx';
import CopyFields from '../staff/menu/CopyFields.tsx';
import MenuOptions from './MenuOptions.tsx';
import '../styles/menu-editor.css';

export default function MenuEditor({
  identity,
  refresh,
}: {
  catalog: MenuItem[];
  identity: Identity;
  refresh: () => Promise<MenuItem[]>;
}) {
  const [data, setData] = useState<MenuAdminCatalog | null>(null);
  const [draft, setDraft] = useState<MenuDraft | null>(null);
  const [preview, setPreview] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [archived, setArchived] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const submitting = useRef(false),
    request = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .menuAdmin(identity)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [identity]);
  async function reload() {
    const latest = await api.menuAdmin(identity);
    setData(latest);
    return latest;
  }
  async function syncCatalog() {
    const [latest] = await Promise.all([api.menuAdmin(identity), refresh()]);
    setData(latest);
    setNeedsRefresh(false);
  }
  async function retryRefresh() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await syncCatalog();
      setError('');
    } catch {
      setError('บันทึกสำเร็จแล้ว แต่โหลดเมนูล่าสุดไม่สำเร็จ กรุณาลองโหลดอีกครั้ง');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function run(mutation: MenuMutation, message: string, closeDraft = false) {
    if (submitting.current || needsRefresh) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const signature = menuRequestSignature(identity.id, mutation);
      if (request.current?.signature !== signature)
        request.current = { signature, key: crypto.randomUUID() };
      await api.manageMenu(identity, mutation, request.current.key);
      request.current = null;
      if (closeDraft) setDraft(null);
      setNotice(message);
      try {
        await syncCatalog();
      } catch {
        setNeedsRefresh(true);
        setError(
          'บันทึกสำเร็จแล้ว แต่โหลดเมนูล่าสุดไม่สำเร็จ กรุณากดโหลดเมนูล่าสุด ไม่ต้องบันทึกซ้ำ',
        );
      }
    } catch (error) {
      setError(
        error instanceof RequestFailure && error.uncertain
          ? 'ยังยืนยันการบันทึกไม่ได้ กรุณาตรวจเน็ตแล้วกดบันทึกรายการเดิมอีกครั้ง'
          : (error as Error).message,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function save() {
    if (!draft || !data || submitting.current || needsRefresh) return;
    try {
      const menu = definitionFromDraft(draft, data.categories);
      void run(
        { kind: 'save', menu, expectedRevision: draft.revision },
        draft.revision
          ? 'บันทึกเมนูแล้ว ออเดอร์เก่าใช้ชื่อและราคาเดิม'
          : 'เพิ่มเมนูแล้ว ลูกค้าสามารถสั่งเมนูนี้ได้',
        true,
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function showPreview() {
    if (!draft || !data) return;
    try {
      const menu = definitionFromDraft(draft, data.categories);
      setPreview({
        ...menu,
        available: true,
        categoryName: data.categories.find((c) => c.code === menu.category)!.name,
      });
      setError('');
      setNotice('');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function start(value: MenuDraft) {
    setDraft(value);
    setError('');
    setNotice('');
    request.current = null;
    window.scrollTo(0, 0);
  }
  async function loadCurrentDraft() {
    if (!draft || !window.confirm('แทนที่ข้อความที่กำลังแก้ด้วยเมนูล่าสุดจากร้าน?')) return;
    setBusy(true);
    try {
      const latest = await reload(),
        item = latest.items.find((i) => i.code === draft.code);
      if (item) start(editDraft(item));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reorder(item: MenuItem, delta: number) {
    const categoryItems = publicCatalog(data!.items).filter((i) => category === 'all' || i.category === category);
    const entries = move(
      categoryItems,
      categoryItems.findIndex((i) => i.code === item.code),
      delta,
    ).map((i) => ({ code: i.code, revision: i.revision ?? 1 }));
    void run({ kind: 'reorder', category, entries }, 'บันทึกลำดับเมนูแล้ว');
  }
  const all = data ? publicCatalog(data.items.map((i) => ({ ...i, archived: false }))) : [];
  // Owner rows retain disabled groups/options when opened for editing.
  const ordered = all.map((i) => data!.items.find((original) => original.code === i.code)!);
  const items = ordered.filter(
    (i) =>
      !!i.archived === archived &&
      (category === 'all' || i.category === category) &&
      (i.name + ' ' + i.description).includes(search.trim()),
  );
  return (
    <section className="menu-editor">
      <p className="eyebrow">เมนูและตัวเลือกของร้าน</p>
      <h1>จัดการเมนู</h1>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {needsRefresh && (
        <button disabled={busy} onClick={() => void retryRefresh()}>
          โหลดเมนูล่าสุด
        </button>
      )}
      {!data ? (
        <>
          <p>กำลังโหลดเมนู…</p>
          {error && (
            <button
              onClick={() => {
                setError('');
                void reload().catch((e) => setError(e.message));
              }}
            >
              ลองโหลดใหม่
            </button>
          )}
        </>
      ) : preview ? (
        <>
          <button
            onClick={() => {
              setPreview(null);
              setNotice('');
            }}
          >
            กลับไปแก้ไข
          </button>
          <p className="info-message">ตัวอย่างเท่านั้น ลองเลือกได้โดยไม่ส่งออเดอร์หรือบันทึกเมนู</p>
          <MenuOptions
            key={preview.code}
            item={preview}
            preview
            onAdd={(input) => {
              const line = priceLine([preview], input);
              setNotice(
                [
                  line.name,
                  line.variantName,
                  ...line.optionNames,
                  ...line.notes,
                  line.freeNote,
                  money(line.totalSatang),
                ]
                  .filter(Boolean)
                  .join(' · '),
              );
            }}
          />
        </>
      ) : draft ? (
        <form
          className="panel"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2>{draft.revision ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h2>
          <fieldset className="menu-editor-fields" disabled={busy || needsRefresh}>
            <label>
              ชื่อเมนู
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </label>
            <div className="menu-editor-grid">
              <label>
                หมวดหมู่
                <select
                  aria-label="หมวดหมู่"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  required
                >
                  {data.categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                หน่วยขาย
                <input
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              คำอธิบายเมนู (ไม่บังคับ)
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="inline-check menu-availability-check">
              <input
                type="checkbox"
                checked={draft.available}
                onChange={(e) => setDraft({ ...draft, available: e.target.checked })}
              />
              เปิดขายเมนูนี้
            </label>
            <VariantFields draft={draft} onChange={setDraft} />
            <GroupFields
              draft={draft}
              templates={[...menuGroupTemplates(data.items).values()]}
              onChange={setDraft}
            />
            <CopyFields copy={draft.copy} onChange={(copy) => setDraft({ ...draft, copy })} />
            <label>
              หมายเหตุที่ลูกค้าเลือกได้ (ไม่บังคับ)
              <textarea
                rows={3}
                value={draft.prepNotes}
                onChange={(e) => setDraft({ ...draft, prepNotes: e.target.value })}
              />
              <small>หนึ่งข้อต่อบรรทัด สูงสุด 5 ข้อ ข้อละไม่เกิน 80 ตัวอักษร</small>
            </label>
            <div className="form-actions">
              <button type="button" onClick={showPreview}>
                ดูตัวอย่างหน้าลูกค้า
              </button>
              <button type="submit" className="primary-action">
                {busy ? 'กำลังบันทึก…' : draft.revision ? 'บันทึกเมนู' : 'บันทึกเมนูใหม่'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError('');
                  setNotice('');
                }}
              >
                กลับ
              </button>
            </div>
            {!!draft.revision && error.includes('แก้ไขแล้ว') && (
              <button type="button" onClick={() => void loadCurrentDraft()}>
                โหลดเมนูล่าสุดแทนฉบับนี้
              </button>
            )}
          </fieldset>
        </form>
      ) : (
        <>
          <p className="info-message">
            ลบเมนูแล้วกู้คืนได้ บิลเก่าคงชื่อและราคาเดิม การปิดขายชั่วคราวใช้สำหรับเมนูหมด
          </p>
          <button
            className="primary-action"
            disabled={busy || needsRefresh}
            onClick={() =>
              start(newDraft(category === 'all' ? (data.categories[0]?.code ?? '') : category))
            }
          >
            เพิ่มเมนูใหม่
          </button>
          <div className="menu-editor-grid">
            <label>
              ค้นหาเมนูที่จัดการ
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label>
              กรองหมวดหมู่
              <select
                aria-label="กรองหมวดหมู่"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {data.categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            แสดงเมนูที่ลบแล้ว
          </label>
          {!items.length && <p>ไม่มีเมนูในรายการนี้</p>}
          <div className="inventory-list">
            {items.map((item) => {
              const siblings = ordered.filter((i) => !i.archived && (category === 'all' || i.category === category)),
                position = siblings.findIndex((i) => i.code === item.code);
              return (
                <article className="panel inventory-row" key={item.code}>
                  <span aria-hidden="true">🍜</span>
                  <div>
                    <h2>{item.name}</h2>
                    <p>
                      {item.variants.map((v) => v.name + ' ' + money(v.priceSatang)).join(' / ')}
                    </p>
                    <small>
                      {item.categoryName} ·{' '}
                      {item.archived ? 'ลบแล้ว' : item.available ? 'พร้อมขาย' : 'ปิดขายชั่วคราว'}
                    </small>
                  </div>
                  <div className="menu-row-actions">
                    <button disabled={busy || needsRefresh} onClick={() => start(editDraft(item))}>
                      แก้ไข
                    </button>
                    {item.archived ? (
                      <button
                        disabled={busy || needsRefresh}
                        onClick={() =>
                          void run(
                            {
                              kind: 'restore',
                              code: item.code,
                              expectedRevision: item.revision ?? 1,
                            },
                            'กู้คืนเมนูแล้ว',
                          )
                        }
                      >
                        กู้คืนเมนู
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy || needsRefresh || position === 0}
                          onClick={() => reorder(item, -1)}
                        >
                          เลื่อนขึ้น
                        </button>
                        <button
                          disabled={busy || needsRefresh || position === siblings.length - 1}
                          onClick={() => reorder(item, 1)}
                        >
                          เลื่อนลง
                        </button>
                        <button
                          className="danger-text"
                          disabled={busy || needsRefresh}
                          onClick={() => {
                            if (
                              window.confirm(
                                'ลบ “' +
                                  item.name +
                                  '” ออกจากหน้าสั่งอาหาร? บิลเก่าจะยังอยู่และกู้คืนเมนูได้',
                              )
                            )
                              void run(
                                {
                                  kind: 'archive',
                                  code: item.code,
                                  expectedRevision: item.revision ?? 1,
                                },
                                'ลบเมนูแล้ว สามารถกู้คืนได้',
                              );
                          }}
                        >
                          ลบเมนู
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

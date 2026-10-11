import type { CustomerCopy } from '../../domain.ts';
export default function CopyFields({
  copy,
  onChange,
}: {
  copy: CustomerCopy;
  onChange: (copy: CustomerCopy) => void;
}) {
  return (
    <fieldset className="menu-editor-group">
      <legend>ข้อความที่ลูกค้าเห็น</legend>
      <label>
        หัวข้อเลือกขนาด
        <input
          value={copy.variantLabel}
          onChange={(e) => onChange({ ...copy, variantLabel: e.target.value })}
          required
        />
      </label>
      <label>
        ข้อความแนะนำลูกค้า
        <textarea
          rows={2}
          value={copy.instructions}
          onChange={(e) => onChange({ ...copy, instructions: e.target.value })}
        />
      </label>
      <label>
        หัวข้อหมายเหตุ
        <input
          value={copy.notesLabel}
          onChange={(e) => onChange({ ...copy, notesLabel: e.target.value })}
          required
        />
      </label>
      <label>
        ข้อความตัวอย่างหมายเหตุ
        <textarea
          rows={2}
          value={copy.notesPlaceholder}
          onChange={(e) => onChange({ ...copy, notesPlaceholder: e.target.value })}
        />
      </label>
    </fieldset>
  );
}

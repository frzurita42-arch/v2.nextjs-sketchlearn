'use client';
/* Renders a Tool Definition field array into a controlled form. Supports the
 * "select-or-custom" type: a dropdown with a ✎ pencil toggle that flips to a
 * free-text input — the same pattern used on the language activity's title. */
import { useState } from 'react';
import type { ToolField } from '@/lib/tool-schema';
import { AudioField, DrawField } from '@/components/tools/MediaFields';
import { ImageField } from '@/components/tools/ImageField';

function Field({ f, value, onChange }: { f: ToolField; value: any; onChange: (v: any) => void }) {
  const inList = f.options?.includes(value);
  // Every dropdown (select AND select-or-custom) supports typing a custom value.
  const selectish = f.type === 'select' || f.type === 'select-or-custom';
  const [custom, setCustom] = useState<boolean>(selectish && value != null && value !== '' && !inList);

  if (f.type === 'textarea') {
    return (
      <label className="field" style={{ gridColumn: '1 / -1' }}><span>{f.label}</span>
        <textarea value={value ?? ''} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} style={{ minHeight: 70 }} />
      </label>
    );
  }
  if (f.type === 'number') {
    return (
      <label className="field"><span>{f.label}</span>
        <input type="number" value={value ?? 0} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
      </label>
    );
  }
  if (f.type === 'toggle') {
    return (
      <label className="field"><span>{f.label}</span>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 20, height: 20 }} />
      </label>
    );
  }
  if (f.type === 'date') {
    return (
      <label className="field"><span>{f.label}</span>
        <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} />
      </label>
    );
  }
  if (f.type === 'image') return <ImageField label={f.label} value={value} onChange={onChange} />;
  if (selectish) {
    return (
      <label className="field"><span>{f.label}
        <button type="button" title={custom ? 'Pick from list' : 'Type a custom value'} onClick={() => setCustom(c => !c)}
          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{custom ? '▾' : '✎'}</button>
      </span>
        {custom
          ? <input type="text" value={value ?? ''} placeholder={f.placeholder || 'Type your own…'} onChange={e => onChange(e.target.value)} />
          : <select value={inList ? value : (f.options?.[0] ?? '')} onChange={e => onChange(e.target.value)}>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>}
      </label>
    );
  }
  if (f.type === 'audio') return <AudioField label={f.label} value={value} onChange={onChange} />;
  if (f.type === 'drawing') return <DrawField label={f.label} value={value} onChange={onChange} />;
  // text (default)
  return (
    <label className="field"><span>{f.label}</span>
      <input type="text" value={value ?? ''} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function ToolFields({ fields, values, onChange }: {
  fields: ToolField[]; values: Record<string, any>; onChange: (id: string, v: any) => void;
}) {
  if (!fields?.length) return null;
  return (
    <div className="settings-compact">
      {fields.map(f => <Field key={f.id} f={f} value={values[f.id]} onChange={v => onChange(f.id, v)} />)}
    </div>
  );
}

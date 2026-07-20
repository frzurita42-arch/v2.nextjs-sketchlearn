'use client';
/* Renders a Tool Definition field array into a controlled form. Supports the
 * "select-or-custom" type: a dropdown with a ✎ pencil toggle that flips to a
 * free-text input — the same pattern used on the language activity's title.
 * When `onSuggest` is provided, each text-like field also gets a 🎨 "suggest with
 * AI" button that fills it in from the tool's context + the other fields. */
import { useState } from 'react';
import type { ToolField } from '@/lib/tool-schema';
import { AudioField, DrawField } from '@/components/tools/MediaFields';
import { ImageField } from '@/components/tools/ImageField';

// Field types where an AI suggestion makes sense (skip media/toggle/date).
const SUGGESTABLE = new Set(['text', 'textarea', 'number', 'select', 'select-or-custom']);

function Field({ f, value, onChange, onSuggest, suggesting }: {
  f: ToolField; value: any; onChange: (v: any) => void; onSuggest?: () => void; suggesting?: boolean;
}) {
  const inList = f.options?.includes(value);
  // Every dropdown (select AND select-or-custom) supports typing a custom value.
  const selectish = f.type === 'select' || f.type === 'select-or-custom';
  const [custom, setCustom] = useState<boolean>(selectish && value != null && value !== '' && !inList);

  // The 🎨 "suggest with AI" control, shown after the label for suggestable fields.
  const suggestBtn = (onSuggest && SUGGESTABLE.has(f.type || 'text')) ? (
    <button type="button" title="Suggest with AI (uses your custom instructions & other settings)" disabled={!!suggesting}
      onClick={onSuggest} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: suggesting ? 'wait' : 'pointer', fontSize: 13 }}>
      {suggesting ? '…' : '🎨'}
    </button>
  ) : null;

  if (f.type === 'textarea') {
    return (
      <label className="field" style={{ width: '100%', maxWidth: 240, gridColumn: '1 / -1' }}><span>{f.label}{suggestBtn}</span>
        <textarea value={value ?? ''} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} style={{ minHeight: 70 }} />
      </label>
    );
  }
  if (f.type === 'number') {
    return (
      <label className="field" style={{ width: '100%', maxWidth: 240 }}><span>{f.label}{suggestBtn}</span>
        <input type="number" value={value ?? 0} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
      </label>
    );
  }
  if (f.type === 'toggle') {
    return (
      <label className="field" style={{ width: '100%', maxWidth: 240 }}><span>{f.label}</span>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 20, height: 20 }} />
      </label>
    );
  }
  if (f.type === 'date') {
    return (
      <label className="field" style={{ width: '100%', maxWidth: 240 }}><span>{f.label}</span>
        <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} />
      </label>
    );
  }
  if (f.type === 'image') return <ImageField label={f.label} value={value} onChange={onChange} />;
  if (selectish) {
    return (
      <label className="field" style={{ width: '100%', maxWidth: 240 }}><span>{f.label}
        <button type="button" title={custom ? 'Pick from list' : 'Type a custom value'} onClick={() => setCustom(c => !c)}
          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{custom ? '▾' : '✎'}</button>
        {suggestBtn}
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
    <label className="field" style={{ width: '100%', maxWidth: 240 }}><span>{f.label}{suggestBtn}</span>
      <input type="text" value={value ?? ''} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function ToolFields({ fields, values, onChange, onSuggest, suggesting, single }: {
  fields: ToolField[]; values: Record<string, any>; onChange: (id: string, v: any) => void;
  onSuggest?: (id: string) => void; suggesting?: Record<string, boolean>;
  single?: boolean;   // stack the fields in ONE column instead of the 2-column grid
}) {
  if (!fields?.length) return null;
  return (
    <div className="settings-compact" style={single ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
      {fields.map(f => <Field key={f.id} f={f} value={values[f.id]} onChange={v => onChange(f.id, v)}
        onSuggest={onSuggest ? () => onSuggest(f.id) : undefined} suggesting={!!suggesting?.[f.id]} />)}
    </div>
  );
}

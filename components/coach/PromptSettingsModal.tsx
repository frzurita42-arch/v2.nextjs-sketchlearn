'use client';
/* ChatBot behaviour settings — built on the SAME shared components as the slide-tool
 * generator so restyling them restyles both surfaces:
 *   • CardShell (the gallery/feed card container, incl. the top image area),
 *   • StepWizard (progress dots + step nav),
 *   • ToolFields (the labelled input grid).
 * The chat's own settings are mapped into ToolField descriptors below. */
import type { CSSProperties } from 'react';
import {
  usePromptSettings, TONES, STICKY_TYPES, BREVITY_LABELS, FREQ_LABELS, INTERACTIVITY_LABELS, ICON_LABELS,
} from '@/lib/prompt-settings';
import { ToolFields } from '@/components/tools/ToolFields';
import { StepWizard, type WizardStep } from '@/components/ui/StepWizard';
import { CardShell } from '@/components/ui/CardShell';
import type { ToolField } from '@/lib/tool-schema';

// Discrete 0–4 settings are shown as dropdowns (the slide tool uses selects too), so
// we map an index ⇄ its label when reading/writing.
const toLabel = (labels: string[], i: number) => labels[Math.max(0, Math.min(labels.length - 1, Number(i) || 0))];
const toIdx = (labels: string[], l: string) => { const i = labels.indexOf(l); return i < 0 ? 0 : i; };
const toneLabel = (k: string) => (TONES.find((t) => t.key === k)?.label) || TONES[0].label;
const labelToTone = (l: string) => (TONES.find((t) => t.label === l)?.key) || 'stale';

const footnote: CSSProperties = { margin: '10px 2px 0', fontSize: 11.5, color: 'var(--muted,#8a7f70)', lineHeight: 1.4 };

export function PromptSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, update] = usePromptSettings();

  // One value map + one dispatcher keyed by field id — the ToolFields contract.
  const values: Record<string, any> = {
    tone: toneLabel(s.tone),
    brevity: toLabel(BREVITY_LABELS, s.brevity),
    emoji: s.emoji,
    interactivity: toLabel(INTERACTIVITY_LABELS, s.interactivity),
    stickyFreq: toLabel(FREQ_LABELS, s.stickyFreq),
    toolbarIcon: toLabel(ICON_LABELS, s.toolbarIcon),
    ...Object.fromEntries(STICKY_TYPES.map((t) => [`sticky_${t.key}`, s.stickyTypes.includes(t.key)])),
  };
  const onChange = (id: string, v: any) => {
    if (id === 'tone') update({ tone: labelToTone(v) });
    else if (id === 'brevity') update({ brevity: toIdx(BREVITY_LABELS, v) });
    else if (id === 'emoji') update({ emoji: !!v });
    else if (id === 'interactivity') update({ interactivity: toIdx(INTERACTIVITY_LABELS, v) });
    else if (id === 'stickyFreq') update({ stickyFreq: toIdx(FREQ_LABELS, v) });
    else if (id === 'toolbarIcon') update({ toolbarIcon: toIdx(ICON_LABELS, v) });
    else if (id.startsWith('sticky_')) {
      const key = id.slice('sticky_'.length);
      const has = s.stickyTypes.includes(key);
      update({ stickyTypes: has ? s.stickyTypes.filter((x) => x !== key) : [...s.stickyTypes, key] });
    }
  };

  // Reply length is a single dropdown now (the old "max length (words)" was redundant —
  // both controlled how long the reply is). Length adapts to the message; the chosen
  // level is the ceiling (see footnote + the coach prompt).
  const lengthTone: ToolField[] = [
    { id: 'tone', label: 'Tone', type: 'select', options: TONES.map((t) => t.label) },
    { id: 'brevity', label: 'Reply length', type: 'select', options: BREVITY_LABELS },
    { id: 'emoji', label: 'Allow a few emojis', type: 'toggle' },
  ];
  const interactStickies: ToolField[] = [
    { id: 'interactivity', label: 'Interactivity', type: 'select', options: INTERACTIVITY_LABELS },
    { id: 'stickyFreq', label: 'Sticky-note publicity', type: 'select', options: FREQ_LABELS },
    ...STICKY_TYPES.map((t): ToolField => ({ id: `sticky_${t.key}`, label: `Sticky · ${t.label}`, type: 'toggle' })),
  ];
  const toolbar: ToolField[] = [
    { id: 'toolbarIcon', label: 'Toolbar icon size', type: 'select', options: ICON_LABELS },
  ];

  const steps: WizardStep[] = [
    { key: 'lengthTone', title: 'Length & tone', render: () => (
      <>
        <ToolFields fill fields={lengthTone} values={values} onChange={onChange} />
        <p style={footnote}>ℹ️ Replies adapt to your message — a short, casual message gets a short reply; the bot only writes at length when the content needs it, up to the size chosen here.</p>
      </>
    ) },
    { key: 'interact', title: 'Interactivity & sticky-notes', render: () => <ToolFields fill fields={interactStickies} values={values} onChange={onChange} /> },
    { key: 'toolbar', title: 'Toolbar', render: () => <ToolFields fill fields={toolbar} values={values} onChange={onChange} /> },
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Feed width (~560) + a small image area at the top — the same CardShell used by
          the repo / slide-tool settings cards. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560 }}>
        <CardShell
          view="grid"
          thumbHeight={84}
          gridHeight={478}
          title=""
          bodyStyle={{ padding: '10px 14px 12px' }}
          body={(
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <b>🤖 ChatBot settings</b>
                <button className="btn small ghost" onClick={onClose}>✕</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <StepWizard
                  steps={steps}
                  finalActions={<button className="btn small green" onClick={onClose}>✓ Done</button>}
                  bodyMinHeight={140}
                  actionsJustify="flex-end"
                />
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}

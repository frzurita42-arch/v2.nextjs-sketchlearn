'use client';
/* ChatBot behaviour settings — rendered through the SAME SetupWizardCard the repo
 * settings and the "Create a … activity" card use, so it is pixel-for-pixel the same
 * card (photo spot on top, fixed dimensions, 2-column fields, Next/Back on the RIGHT).
 * The chat's own settings are mapped into ToolField descriptors below.
 *
 * The last page ("How I reply") shows the EXACT system prompt the chat is given, so
 * you can read and understand what instructs its replies. */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { API } from '@/lib/api';
import {
  usePromptSettings, TONES, STICKY_TYPES, BREVITY_LABELS, FREQ_LABELS, INTERACTIVITY_LABELS, ICON_LABELS,
} from '@/lib/prompt-settings';
import { ToolFields } from '@/components/tools/ToolFields';
import { WizardGridTemplate } from '@/components/ui/WizardGridTemplate';
import { SetupWizardCard } from '@/components/ui/SetupWizardCard';
import type { WizardStep } from '@/components/ui/StepWizard';
import type { ToolField } from '@/lib/tool-schema';

// Discrete 0–4 settings are shown as dropdowns (the slide tool uses selects too), so
// we map an index ⇄ its label when reading/writing.
const toLabel = (labels: string[], i: number) => labels[Math.max(0, Math.min(labels.length - 1, Number(i) || 0))];
const toIdx = (labels: string[], l: string) => { const i = labels.indexOf(l); return i < 0 ? 0 : i; };
const toneLabel = (k: string) => (TONES.find((t) => t.key === k)?.label) || TONES[0].label;
const labelToTone = (l: string) => (TONES.find((t) => t.label === l)?.key) || 'stale';

const footnote: CSSProperties = { margin: '8px 2px 0', fontSize: 11.5, color: 'var(--muted,#8a7f70)', lineHeight: 1.4 };

export function PromptSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, update] = usePromptSettings();
  const [step, setStep] = useState(0);
  const [promptText, setPromptText] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);

  // Load the REAL assembled system prompt when the "How I reply" page is shown (and
  // whenever the settings change while it is open, so it reflects your current config).
  useEffect(() => {
    if (step !== 3) return;
    setPromptLoading(true);
    API.post('/api/ai/coach-prompt', { promptSettings: s })
      .then((r: any) => setPromptText(String(r?.system || '')))
      .catch((e: any) => setPromptText(`(Could not load the instructions: ${e.message})`))
      .finally(() => setPromptLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, s]);

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

  const goN = () => setStep((n) => Math.min(3, n + 1));
  const goB = () => setStep((n) => Math.max(0, n - 1));
  const grid = (fields: ToolField[], extra?: React.ReactNode) => (
    <div style={{ width: '100%' }}>
      <ToolFields fill fields={fields} values={values} onChange={onChange} />
      {extra}
    </div>
  );
  const done = <button className="btn small green" style={{ width: 96, height: 40 }} onClick={onClose}>✓ Done</button>;
  const copyPrompt = () => { try { navigator.clipboard?.writeText(promptText); } catch { /* ignore */ } };

  // The "How I reply" page: a read-only, scrollable box with the actual system prompt.
  const instructions = (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 11.3, color: 'var(--muted,#8a7f70)', lineHeight: 1.4 }}>
        These are the exact instructions the chatbot is given <b>before</b> your messages. Each reply is produced from: this text
        + your settings on the previous pages + the recent chat history (its <b>memory</b>) + your new message → the AI model.
        Read-only — edit behaviour with the settings, or ask me to make this editable.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn small ghost" onClick={copyPrompt} title="Copy the full prompt">📋 Copy</button>
        <button className="btn small ghost" onClick={() => setStep(3)} disabled={promptLoading} title="Reload for current settings">{promptLoading ? '…' : '🔄 Refresh'}</button>
        <span style={{ fontSize: 10.5, opacity: 0.5 }}>{promptText ? `${promptText.length.toLocaleString()} chars` : ''}</span>
      </div>
      <textarea readOnly value={promptLoading ? 'Loading the current instructions…' : promptText}
        style={{ width: '100%', flex: 1, minHeight: 96, boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          fontSize: 11, lineHeight: 1.45, padding: '8px 10px', border: '2px solid var(--ink,#2d2a26)', borderRadius: 8,
          background: 'var(--card,#fff8ee)', color: 'var(--ink,#2d2a26)', resize: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap' }} />
    </div>
  );

  // Every step lays its content on the left with Next (top) / Back (bottom) on the
  // RIGHT — the same WizardGridTemplate the repo settings uses.
  const steps: WizardStep[] = [
    { key: 'lengthTone', title: 'Length & tone', render: () => (
      <WizardGridTemplate rowButtons onNext={goN} onBack={goB} backDisabled={step === 0}
        top={grid(lengthTone, <p style={footnote}>ℹ️ Replies adapt to your message — a short, casual message gets a short reply; the bot only writes at length when the content needs it, up to the size chosen here.</p>)} />
    ) },
    { key: 'interact', title: 'Interactivity & sticky-notes', render: () => (
      <WizardGridTemplate rowButtons onNext={goN} onBack={goB} backDisabled={step === 0} top={grid(interactStickies)} />
    ) },
    { key: 'toolbar', title: 'Toolbar', render: () => (
      <WizardGridTemplate rowButtons onNext={goN} onBack={goB} backDisabled={step === 0} top={grid(toolbar)} />
    ) },
    { key: 'instructions', title: 'How I reply — the prompt', render: () => (
      <WizardGridTemplate tall onBack={goB} backDisabled={step === 0} rightTop={done} top={instructions} />
    ) },
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Wide container so the shared card matches the repo settings' dimensions. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 'min(94vw, 860px)' }}>
        <SetupWizardCard
          title={<span style={{ fontSize: 15 }}>🤖 ChatBot settings</span>}
          onClose={onClose}
          steps={steps}
          stepIndex={step}
          onStepChange={setStep}
        />
      </div>
    </div>
  );
}

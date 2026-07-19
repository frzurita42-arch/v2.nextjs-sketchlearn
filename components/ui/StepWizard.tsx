'use client';
/* A small, reusable step-by-step wizard: a progress bar, one step at a time, Back /
 * Next navigation, and — on the last step — the caller's final actions (e.g. Play /
 * Generate) plus a Cancel that resets to step one. Reused wherever a form is better
 * shown as a guided flow. */
import { useEffect, useState } from 'react';

export interface WizardStep { key: string; title: string; render: () => React.ReactNode; }

export function StepWizard({ steps, finalActions, onCancel, resetKey, bodyMinHeight }: {
  steps: WizardStep[];
  finalActions: React.ReactNode;   // shown on the LAST step (Play / Generate …)
  onCancel?: () => void;
  resetKey?: unknown;              // change this to reset back to step 1
  bodyMinHeight?: number;          // fix the step body height so the card doesn't jump between steps
}) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [resetKey]);
  const clamped = Math.min(i, steps.length - 1);
  const step = steps[clamped];
  const last = clamped === steps.length - 1;
  const reset = () => setI(0);
  return (
    <div>
      {/* Progress bar. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {steps.map((s, k) => (
          <span key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, background: k <= clamped ? 'var(--green,#7fb069)' : 'var(--line,#d9cfc0)' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
        Step {clamped + 1} of {steps.length} — {step.title}
      </div>
      <div style={bodyMinHeight ? { minHeight: bodyMinHeight } : undefined}>{step.render()}</div>
      <div className="slide-actions" style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {clamped > 0 && <button className="btn small ghost" onClick={() => setI(clamped - 1)}>← Back</button>}
        {!last && <button className="btn small green" onClick={() => setI(clamped + 1)}>Next →</button>}
        {last && finalActions}
        {onCancel && <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => { reset(); onCancel(); }}>✕ Cancel</button>}
      </div>
    </div>
  );
}

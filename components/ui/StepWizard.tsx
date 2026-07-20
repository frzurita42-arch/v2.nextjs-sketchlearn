'use client';
/* A small, reusable step-by-step wizard: a compact progress row, one step at a
 * time, Back / Next navigation, and — on the last step — the caller's final
 * actions (e.g. Play / Generate). Reused wherever a form is better shown as a
 * guided flow. */
import { useEffect, useState } from 'react';

export interface WizardStep { key: string; title: string; render: () => React.ReactNode; }

export function StepWizard({ steps, finalActions, resetKey, bodyMinHeight, actionsJustify = 'center', stepIndex, onStepChange, showFooter = true }: {
  steps: WizardStep[];
  finalActions: React.ReactNode;   // shown on the LAST step (Play / Generate …)
  resetKey?: unknown;              // change this to reset back to step 1
  bodyMinHeight?: number;          // fix the step body height so the card doesn't jump between steps
  actionsJustify?: 'center' | 'flex-end';
  stepIndex?: number;              // controlled step index (optional)
  onStepChange?: (i: number) => void;
  showFooter?: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [resetKey]);
  const internal = Math.min(i, steps.length - 1);
  const controlled = typeof stepIndex === 'number';
  const clamped = Math.min(Math.max(0, controlled ? stepIndex : internal), Math.max(0, steps.length - 1));
  const go = (n: number) => {
    const nx = Math.min(Math.max(0, n), Math.max(0, steps.length - 1));
    if (controlled) onStepChange?.(nx);
    else setI(nx);
  };
  const step = steps[clamped];
  const last = clamped === steps.length - 1;
  const footerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    minHeight: 56,
  };
  return (
    <div>
      {/* Compact progress dots. */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, marginBottom: 8, alignItems: 'center', width: '100%' }}>
        {steps.map((s, k) => (
          <span key={s.key} style={{ width: 8, height: 8, borderRadius: '50%', background: k <= clamped ? 'var(--green,#7fb069)' : 'var(--line,#d9cfc0)', justifySelf: 'center' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>
        Step {clamped + 1} of {steps.length} — {step.title}
      </div>
      <div style={bodyMinHeight ? { minHeight: bodyMinHeight } : undefined}>{step.render()}</div>
      {showFooter && (
        <div className="slide-actions" style={footerStyle}>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            {clamped > 0 && <button className="btn small ghost" style={{ minWidth: 84 }} onClick={() => go(clamped - 1)}>← Back</button>}
          </div>
          <div style={{ display: 'flex', justifyContent: actionsJustify, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!last && <button className="btn small green" style={{ minWidth: 92 }} onClick={() => go(clamped + 1)}>Next →</button>}
            {last && finalActions}
          </div>
        </div>
      )}
    </div>
  );
}

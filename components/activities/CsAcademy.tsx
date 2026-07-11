'use client';
/* Home-feed card that opens the Cybersecurity Academy (adaptive career path). */
import { useApp } from '@/components/AppContext';
import { InstructionPlank } from './InstructionPlank';

export function CsAcademy() {
  const app = useApp();
  return (
    <section style={{ maxWidth: 760, margin: '24px auto 0' }}>
      <h4 className="activity-heading" style={{ margin: '0 0 6px', opacity: 0.9 }}>Cybersecurity Academy</h4>
      <InstructionPlank>Build an adaptive learning path toward a security role — it estimates your level, finds gaps, and re-plans your next five courses as you progress.</InstructionPlank>
      <div className="card alt" style={{ maxWidth: 760, margin: '0 auto 0', padding: '14px 16px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 14, opacity: 0.9 }}>
          Pick a target role (Pentester, SOC Analyst, Red Team…), and get a personalized roadmap with timeframes and authorized-lab resources.
        </p>
        <div className="slide-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn green" onClick={() => app.nav('cspath')}>Open the Academy →</button>
        </div>
      </div>
    </section>
  );
}

'use client';
import React from 'react';
import type { ViewAs } from '@/components/AppContext';

/* ViewAsBar — the admin "View as" preview container.
 *
 * A single bordered block grouping the 👁 View-as role toggles (Guest / User /
 * Moderators / Admin / Languages / STEM) that let an admin render any page as
 * that kind of viewer would see it — a client-side preview only; the real
 * session and server permissions are unchanged. It closes with a dashed rule so
 * it reads as its own section, separated from the page below.
 *
 * Admin-only: the caller renders it only when the signed-in user is an admin. */

// The role buttons. [value, label, disabled, tooltip]. Guest / Languages / STEM
// are placeholders for now — shown but disabled.
const ROLES: [string, string, boolean, string][] = [
  ['guest', 'Guest', true, 'A visitor who is NOT signed in — coming soon'],
  ['user', 'User', false, 'As a plain signed-in visitor'],
  ['op', 'Moderators', false, 'As a moderator (the content owner)'],
  ['self', 'Admin', false, 'Your admin view'],
  ['languages', 'Languages', true, 'Language view — coming soon'],
  ['stem', 'STEM', true, 'STEM view — coming soon'],
];

export function ViewAsBar({ viewAs, onSetViewAs }: { viewAs: ViewAs; onSetViewAs: (v: ViewAs) => void }) {
  return (
    <section aria-label="View-as preview" style={{ margin: '6px 0 0' }}>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ opacity: 0.6, fontWeight: 700 }}>👁 View as</span>
        {ROLES.map(([v, label, disabled, title]) => (
          <button key={v} className={`btn small ${!disabled && viewAs === v ? 'blue' : 'ghost'}`}
            style={{ padding: '2px 10px', ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
            disabled={disabled} onClick={disabled ? undefined : () => onSetViewAs(v as ViewAs)} title={title}>{label}</button>
        ))}
      </div>
      {/* Dashed separator so the preview bar is its own section. */}
      <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.4, margin: '8px 0 0' }} />
    </section>
  );
}

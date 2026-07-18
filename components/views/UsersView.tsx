'use client';
/* Users — a directory of everyone on the system, laid out like the Moderators page
 * and using the SAME shared card container, so the Settings card-size slider resizes
 * these cards too. The user list comes from /api/users (admin-only), so non-admins
 * see a friendly note. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { useCardSize, useImgSize, galleryLayout } from '@/lib/card-size';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { ProfileCard } from '@/components/ui/ProfileCard';

type Row = { username: string; role: string; createdAt?: string | null; gamesPlayed?: number };

const AV_EMOJI = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
function avatarFor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { emoji: AV_EMOJI[h % AV_EMOJI.length], color: `hsl(${h % 360} 55% 52%)` };
}
function fmtDate(v: any): string { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); }
const roleBadge = (r: string) => r === 'admin' ? '🛡️ Admin' : r === 'moderator' ? '🎓 Moderator' : '☺ User';

export function UsersView() {
  const app = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const cardSize = useCardSize('users');
  const imgMode = useImgSize('users');
  const layout = galleryLayout(cardSize);

  useEffect(() => {
    API.get('/api/users')
      .then((r: any) => setRows(Array.isArray(r) ? r : (Array.isArray(r?.users) ? r.users : [])))
      .catch((e: any) => setErr(e?.message || 'Could not load users.'));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((u) => !term || `${u.username} ${u.role}`.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeaderBar pageKey="users" title="👥 Users" subtitle={`Everyone on the system${rows ? ` — ${rows.length} total` : ''}.`} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by name or role…"
            style={{ flex: '1 1 220px', minWidth: 0 }} />
          <CardViewMenu pageKey="users" />
        </div>

        {err && <p style={{ color: 'var(--muted,#8a7f70)' }}>{/403|admin|Unauthorized|Forbidden/i.test(err) ? 'The full user directory is available to admins only.' : err}</p>}
        {!err && rows === null && <p style={{ color: 'var(--muted,#8a7f70)' }}>Loading users…</p>}
        {!err && rows !== null && filtered.length === 0 && <p style={{ color: 'var(--muted,#8a7f70)' }}>No users match your search.</p>}

        {!err && filtered.length > 0 && (
          <div style={{ ...layout.container, alignItems: 'stretch' }}>
            {filtered.map((u) => {
              const av = avatarFor(u.username);
              return (
                <ProfileCard key={u.username} view={layout.view}
                  name={u.username} title={u.username} emoji={av.emoji} color={av.color}
                  badge={roleBadge(u.role)} imageMode={imgMode}
                  subtitle={`${roleBadge(u.role)} · joined ${fmtDate(u.createdAt)}`}
                  meta={<span style={{ fontSize: 11, opacity: 0.6 }}>joined {fmtDate(u.createdAt)} · 🎮 {u.gamesPlayed ?? 0}</span>} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

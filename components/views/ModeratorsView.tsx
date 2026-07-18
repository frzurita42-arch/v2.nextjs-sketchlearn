'use client';
/* Moderators — a PUBLIC directory (open to guests) of the site's moderators and
 * admins. Each person gets a card with a short title, subtitle and interests, plus
 * a WhatsApp button. The moderator themselves (or an admin) can edit their own card
 * inline; edits persist server-side via /api/moderators. A search bar filters by
 * name / interest / description keywords, an age filter narrows the range, and a
 * comment section sits at the bottom. The page chrome (orange-underlined title +
 * subtitle + dashed rule) is the shared <PageHeader>, matching every other page. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { DiscussionSection } from '@/components/social/DiscussionSection';
import { useCardSize, galleryLayout } from '@/lib/card-size';

type Profile = { title?: string; subtitle?: string; interests?: string; whatsapp?: string; age?: number; image?: string };
type Moderator = { username: string; role: 'admin' | 'moderator' | 'user'; createdAt?: string | null; gamesPlayed?: number; profile: Profile };

// Deterministic emoji+colour avatar from a username (matches the comment style).
const AV_EMOJI = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
const AV_COLOR = ['#f9a03f', '#5c80bc', '#7fb069', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f'];
function avatarFor(name: string) {
  let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return { emoji: AV_EMOJI[h % AV_EMOJI.length], color: AV_COLOR[(h >> 4) % AV_COLOR.length] };
}

// Turn a stored WhatsApp value (a phone number OR a full link) into an openable URL.
function waLink(raw?: string): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/wa\.me|whatsapp/i.test(v)) return 'https://' + v.replace(/^\/+/, '');
  const digits = v.replace(/[^\d]/g, '');
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

export function ModeratorsView() {
  const app = useApp();
  const perms = app.eff();
  const [mods, setMods] = useState<Moderator[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const load = () => {
    API.get('/api/moderators')
      .then((r: any) => setMods(Array.isArray(r?.moderators) ? r.moderators : []))
      .catch((e: any) => setErr(e?.message || 'Could not load moderators.'));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    if (!mods) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const lo = parseInt(minAge, 10); const hi = parseInt(maxAge, 10);
    return mods.filter((m) => {
      const p = m.profile || {};
      const hay = [m.username, p.title, p.subtitle, p.interests].filter(Boolean).join(' ').toLowerCase();
      if (terms.length && !terms.every((t) => hay.includes(t))) return false;
      if (Number.isFinite(lo) && (!p.age || p.age < lo)) return false;
      if (Number.isFinite(hi) && (!p.age || p.age > hi)) return false;
      return true;
    });
  }, [mods, q, minAge, maxAge]);

  const [cardSize] = useCardSize();
  const layout = galleryLayout(cardSize);
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px' }}>🛡️ Moderators</h2>
        <p style={{ margin: '0 0 12px', color: 'var(--muted,#8a7f70)', fontSize: 14 }}>The site&apos;s active moderators &amp; admins.</p>

        {/* Search + age filter (styled like the other galleries) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 16px' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Search by name, interest or keyword…"
            style={{ flex: '1 1 220px', minWidth: 0, padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--ink)', fontSize: 13, background: 'var(--card,#fff8ee)', font: 'inherit' }} />
          <span style={{ fontSize: 13, color: 'var(--muted,#8a7f70)' }}>Age</span>
          <input value={minAge} onChange={(e) => setMinAge(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
            placeholder="min" style={{ width: 64, padding: '8px 10px', borderRadius: 10, border: '2px solid var(--ink)', fontSize: 14 }} />
          <span style={{ color: 'var(--muted,#8a7f70)' }}>–</span>
          <input value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
            placeholder="max" style={{ width: 64, padding: '8px 10px', borderRadius: 10, border: '2px solid var(--ink)', fontSize: 14 }} />
          {(q || minAge || maxAge) && <button className="btn small ghost" onClick={() => { setQ(''); setMinAge(''); setMaxAge(''); }}>Clear</button>}
        </div>

        {err && <p style={{ color: 'var(--danger,#e4572e)' }}>{err}</p>}
        {mods === null && !err && <p style={{ color: 'var(--muted,#8a7f70)' }}>Loading moderators…</p>}
        {mods !== null && filtered.length === 0 && !err && (
          <p style={{ color: 'var(--muted,#8a7f70)' }}>{mods.length === 0 ? 'No moderators yet.' : 'No moderators match your search.'}</p>
        )}

        <div style={{ ...layout.container, alignItems: 'start' }}>
          {filtered.map((m) => (
            <ModeratorCard key={m.username} mod={m}
              canEdit={perms.isAdmin || perms.username === m.username}
              editing={editing === m.username}
              onEdit={() => setEditing(m.username)}
              onCancel={() => setEditing(null)}
              onSaved={(p) => { setEditing(null); setMods((cur) => (cur || []).map((x) => x.username === m.username ? { ...x, profile: p } : x)); }} />
          ))}
        </div>

        <DiscussionSection titleKey="moderatorsDiscussionTitle" titleFallback="💬 Discussion"
          collapseKey="moderatorsDiscussionCollapsed"
          targetType="tool" targetId="__moderators__" maxWidth={980} />
      </div>
    </div>
  );
}

function ModeratorCard({ mod, canEdit, editing, onEdit, onCancel, onSaved }: {
  mod: Moderator; canEdit: boolean; editing: boolean;
  onEdit: () => void; onCancel: () => void; onSaved: (p: Profile) => void;
}) {
  const av = avatarFor(mod.username);
  const p = mod.profile || {};
  const wa = waLink(p.whatsapp);
  const roleBadge = mod.role === 'admin' ? '🛡️ Admin' : '🛡️ Moderator';

  if (editing) return <ModeratorEditor mod={mod} onCancel={onCancel} onSaved={onSaved} />;

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {p.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.image} alt={mod.username} style={{ flex: '0 0 auto', width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ink)' }} />
          : <span style={{ flex: '0 0 auto', width: 42, height: 42, borderRadius: '50%', background: av.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, border: '2px solid var(--ink)' }}>{av.emoji}</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || mod.username}</div>
          <div style={{ fontSize: 12, color: 'var(--muted,#8a7f70)' }}>{roleBadge}{p.age ? ` · ${p.age}` : ''} · ☺ {mod.username}</div>
        </div>
      </div>
      {p.subtitle && <div style={{ fontSize: 13.5 }}>{p.subtitle}</div>}
      {p.interests && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.interests.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10).map((tag, i) => (
            <span key={i} style={{ fontSize: 11.5, background: 'var(--chip,#f0e9dc)', border: '1.5px solid var(--ink)', borderRadius: 999, padding: '2px 9px' }}>{tag}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
        {wa
          ? <a className="btn small green" href={wa} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>💬 WhatsApp</a>
          : <span style={{ fontSize: 12, color: 'var(--muted,#8a7f70)' }}>No WhatsApp linked</span>}
        {canEdit && <button className="btn small ghost" onClick={onEdit}>✎ Edit</button>}
      </div>
    </div>
  );
}

function ModeratorEditor({ mod, onCancel, onSaved }: { mod: Moderator; onCancel: () => void; onSaved: (p: Profile) => void }) {
  const p = mod.profile || {};
  const [title, setTitle] = useState(p.title || '');
  const [subtitle, setSubtitle] = useState(p.subtitle || '');
  const [interests, setInterests] = useState(p.interests || '');
  const [whatsapp, setWhatsapp] = useState(p.whatsapp || '');
  const [age, setAge] = useState(p.age ? String(p.age) : '');
  const [image, setImage] = useState(p.image || '');
  const [busy, setBusy] = useState(false);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    const profile: Profile = { title: title.trim(), subtitle: subtitle.trim(), interests: interests.trim(), whatsapp: whatsapp.trim(), age: age ? parseInt(age, 10) : undefined, image };
    try {
      const r: any = await API.put('/api/moderators', { username: mod.username, profile });
      onSaved(r?.profile || profile);
    } catch (e: any) { setErr(e?.message || 'Could not save.'); setBusy(false); }
  };

  // Generate an AI portrait from what we know about this person. The endpoint
  // saves it too, so it persists even without pressing Save. Each press varies the
  // ethnicity, so pressing again gives a different face.
  const makePortrait = async () => {
    setPortraitBusy(true); setErr('');
    try {
      const r: any = await API.post('/api/moderators/portrait', { username: mod.username });
      if (r?.url) setImage(r.url);
      else setErr(r?.error || 'Could not generate a portrait.');
    } catch (e: any) { setErr(e?.message || 'Could not generate a portrait.'); }
    setPortraitBusy(false);
  };

  const field = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '2px solid var(--ink)', fontSize: 13.5, marginTop: 3 } as const;
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--muted,#8a7f70)' } as const;

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Edit card · {mod.username}</div>
      <label style={lbl}>Short title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Math moderator" style={field} /></label>
      <label style={lbl}>Subtitle<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={120} placeholder="A one-line description" style={field} /></label>
      <label style={lbl}>Interests (comma-separated)<input value={interests} onChange={(e) => setInterests(e.target.value)} maxLength={300} placeholder="algebra, chess, hiking" style={field} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...lbl, flex: 1 }}>WhatsApp (number or link)<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={120} placeholder="+1 555 123 4567" style={field} /></label>
        <label style={{ ...lbl, width: 90 }}>Age<input value={age} onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" maxLength={3} style={field} /></label>
      </div>

      {/* Profile picture: an AI portrait imagined from this person's name, card copy,
          interests, lesson history and tokens. Press again for a different face. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
        {image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image} alt="portrait" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ink)' }} />
          : <span style={{ width: 56, height: 56, borderRadius: '50%', border: '2px dashed var(--ink)', display: 'grid', placeItems: 'center', fontSize: 20, opacity: 0.6 }}>👤</span>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn small" disabled={portraitBusy} onClick={makePortrait} title="Generate an AI portrait from this profile">{portraitBusy ? '🎨 Imagining…' : (image ? '🎨 Regenerate portrait' : '🎨 AI portrait')}</button>
          {image && <button className="btn small ghost" disabled={portraitBusy} onClick={() => setImage('')} style={{ fontSize: 11 }}>Remove photo</button>}
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger,#e4572e)', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn small green" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn small ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

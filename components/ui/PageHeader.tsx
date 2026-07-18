/* PageHeader — the ONE reusable page header: an optional emoji, a scribble-
 * underlined title, a subtitle, and a closing dashed separator, all in a single
 * container. Title/subtitle/emoji come from the DB (site_settings) via the page's
 * PAGE_HEADERS definition, so the copy is editable, not hard-coded.
 *
 * Admins get inline controls in the container: ✎ edit (manual) and 🎨 AI reword
 * ("diffuse") for both the title and the subtitle, an 👁 toggle to hide the emoji,
 * and a click-the-emoji-to-change affordance. Everyone else just sees the header.
 *
 * Used on the Repositories, Slides, Coach chat and Dashboard pages. Add a page to PAGE_HEADERS
 * and drop <PageHeader page="…"/> in to give any new page the same header. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { PAGE_HEADERS } from '@/lib/page-settings';

const headIcon: React.CSSProperties = { marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, verticalAlign: 'middle' };
const CACHE = 'sl_site_settings';

export function PageHeader({ page, left, right }: { page: keyof typeof PAGE_HEADERS | string; left?: React.ReactNode; right?: React.ReactNode }) {
  const def = PAGE_HEADERS[page as string];
  // The emoji rides inside the title text on every page (repos/slides/coach/
  // dashboard), so hide the separate toggleable emoji slot everywhere — that
  // keeps the emoji consistent and immune to a stale per-page emoji-off flag.
  const hidePageEmoji = page === 'repos' || page === 'slides' || page === 'coach' || page === 'dashboard';
  // Seed synchronously from the shared site-settings cache so the DB copy paints
  // on the first frame (no flash of the default), then refresh from the server.
  const [site, setSite] = useState<Record<string, string | undefined>>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    API.get('/api/site-settings').then((r: any) => { const s = r?.settings || {}; setSite(s); try { localStorage.setItem(CACHE, JSON.stringify(s)); } catch { /* ignore */ } }).catch(() => { /* ignore */ });
  }, []);
  const isAdmin = API.user?.role === 'admin';
  const [editing, setEditing] = useState<null | 'title' | 'subtitle'>(null);
  const [draft, setDraft] = useState('');
  const [mix, setMix] = useState<Record<string, boolean>>({});

  if (!def) return null;
  const title = site[def.titleKey] || def.defaultTitle;
  const subtitle = site[def.subtitleKey] || def.defaultSubtitle;
  const emoji = site[def.emojiKey] || def.defaultEmoji;
  const emojiOff = hidePageEmoji || site[def.emojiOffKey] === '1';

  const save = async (key: string, value: string) => {
    setSite((s) => { const n = { ...s, [key]: value }; try { localStorage.setItem(CACHE, JSON.stringify(n)); } catch { /* ignore */ } return n; });
    setEditing(null);
    try { await API.put('/api/site-settings', { key, value }); } catch { /* keep optimistic */ }
  };
  const remix = async (key: string, kind: 'title' | 'subtitle') => {
    const cur = key === def.titleKey ? title : subtitle;
    setMix((m) => ({ ...m, [key]: true }));
    try { const r: any = await API.post('/api/site-settings/remix', { text: cur, kind }); if (r?.text) await save(key, r.text); } catch { /* ignore */ }
    setMix((m) => { const n = { ...m }; delete n[key]; return n; });
  };
  const toggleEmoji = () => save(def.emojiOffKey, emojiOff ? '' : '1');
  const changeEmoji = () => { const v = window.prompt('Emoji to show before the title (leave blank to keep):', emoji); if (v && v.trim()) save(def.emojiKey, v.trim().slice(0, 8)); };

  return (
    <div className="page-header-block">
      {/* Optional corner slots — the banner is divided into three: the title stays
          centered (untouched) while these float in the free left/right quarters
          (e.g. the ☕ donations link and a ✈ share link). Absolutely positioned so
          the centered banner never shifts. */}
      {left && <div className="page-header-slot page-header-slot--left">{left}</div>}
      {right && <div className="page-header-slot page-header-slot--right">{right}</div>}
      {editing === 'title' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '0 auto' }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(def.titleKey, draft); if (e.key === 'Escape') setEditing(null); }}
            style={{ fontSize: 24, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => save(def.titleKey, draft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditing(null)}>✕</button>
        </div>
      ) : (
        <h1 className="view-title">
          {/* The scribble underline spans the emoji AND the title as one stroke. */}
          <span className="scribble-underline">
            {!emojiOff && (
              isAdmin
                ? <button title="Change the emoji" onClick={changeEmoji} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', padding: 0, marginRight: 8 }}>{emoji}</button>
                : <span style={{ marginRight: 8 }}>{emoji}</span>
            )}
            {title}
          </span>
          {isAdmin && !hidePageEmoji && <>
            <button title="Edit the title" onClick={() => { setDraft(title); setEditing('title'); }} style={{ ...headIcon, fontSize: 15 }}>✎</button>
            <button title="AI reword the title" disabled={!!mix[def.titleKey]} onClick={() => remix(def.titleKey, 'title')} style={{ ...headIcon, fontSize: 15 }}>{mix[def.titleKey] ? '…' : '🎨'}</button>
            <button title={emojiOff ? 'Show the emoji' : 'Hide the emoji'} onClick={toggleEmoji} style={{ ...headIcon, fontSize: 15, opacity: emojiOff ? 0.4 : 1 }}>👁</button>
          </>}
          {isAdmin && hidePageEmoji && <>
            <button title="Edit the title" onClick={() => { setDraft(title); setEditing('title'); }} style={{ ...headIcon, fontSize: 15 }}>✎</button>
            <button title="AI reword the title" disabled={!!mix[def.titleKey]} onClick={() => remix(def.titleKey, 'title')} style={{ ...headIcon, fontSize: 15 }}>{mix[def.titleKey] ? '…' : '🎨'}</button>
          </>}
        </h1>
      )}
      {editing === 'subtitle' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '4px auto' }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(def.subtitleKey, draft); if (e.key === 'Escape') setEditing(null); }}
            style={{ fontSize: 14, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => save(def.subtitleKey, draft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditing(null)}>✕</button>
        </div>
      ) : (
        <p className="view-sub" style={{ textAlign: 'center' }}>
          {subtitle}
          {isAdmin && <>
            <button title="Edit the subtitle" onClick={() => { setDraft(subtitle); setEditing('subtitle'); }} style={{ ...headIcon, fontSize: 13 }}>✎</button>
            <button title="AI reword the subtitle" disabled={!!mix[def.subtitleKey]} onClick={() => remix(def.subtitleKey, 'subtitle')} style={{ ...headIcon, fontSize: 13 }}>{mix[def.subtitleKey] ? '…' : '🎨'}</button>
          </>}
        </p>
      )}
      <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.45, margin: '12px 0 0' }} />
    </div>
  );
}

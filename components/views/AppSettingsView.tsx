'use client';
/* App settings (new shell layout). The header (title + subtitle) size control now
 * lives NEXT TO the page title itself, half-and-half, via the shared <PageHeaderBar>.
 * Below that, the card LAYOUT + IMAGE controls sit in a thin filter-toolbar above a
 * live card preview. "Apply to all pages" makes a choice universal; the popup
 * (shared) targets specific pages. */
import { useEffect, useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS,
  loadGlobalCardSize, loadGlobalImgSize, applyCardSizeAll, applyImgSizeAll,
} from '@/lib/card-size';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { PerPagePopup } from '@/components/ui/PerPagePopup';
import { InstructionBannerSettings } from '@/components/ui/InstructionBanner';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';
import { CardReference } from '@/components/ui/CardReference';
import { filterSelect } from '@/components/ui/CardViewMenu';
import { DonationMug } from '@/components/ui/DonationMug';
import {
  TOOL_HEADER_FONTS,
  TOOL_HEADER_PAGES,
  TOOL_HEADER_SIZE_MIN,
  TOOL_HEADER_SIZE_MAX,
  loadGlobalToolHeaderSize,
  loadGlobalToolHeaderFont,
  loadGlobalToolHeaderUnderline,
  applyToolHeaderAll,
  setToolHeaderPage,
  clearToolHeaderPage,
  hasToolHeaderOverride,
  type ToolHeaderScope,
} from '@/lib/tool-header-style';
import {
  DONATION_PROMPT_PAGES,
  DONATION_PROMPT_SIZE_MIN,
  DONATION_PROMPT_SIZE_MAX,
  DONATION_PROMPT_TEXT_DEFAULT,
  loadGlobalDonationPromptText,
  loadGlobalDonationPromptSize,
  loadGlobalDonationPromptHidden,
  applyDonationPromptAll,
  setDonationPromptPage,
  clearDonationPromptPage,
  hasDonationPromptOverride,
  type DonationPromptScope,
} from '@/lib/donation-prompt-style';
import { API } from '@/lib/api';
import { ensureSiteSettings } from '@/lib/site-settings-client';
import { useApp } from '@/components/AppContext';
import { PagedTable } from '@/components/ui/PagedTable';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };
const dashBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.015)' };
const MIRROR_CONFIRM_PHRASE = 'PUSH MIRROR';
// The same paper dropdown as the Sandbox filter row (CardViewMenu) — width:auto so it
// sizes to its content in a flex row instead of stretching (global select is 100%).
const paperSel: React.CSSProperties = { ...filterSelect, width: 'auto', minWidth: 130 };

function ToolHeaderPerPagePopup({ size, font, underline, onClose }: { size: number; font: string; underline: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const chosen = TOOL_HEADER_PAGES.filter((p) => sel[p.key]).map((p) => p.key);
  const allOn = chosen.length === TOOL_HEADER_PAGES.length;
  const toggle = (k: ToolHeaderScope) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(TOOL_HEADER_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => setToolHeaderPage(k as ToolHeaderScope, size, font, underline)); onClose(); };
  const reset = () => { chosen.forEach((k) => clearToolHeaderPage(k as ToolHeaderScope)); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Slide tool header per page</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px 12px', margin: '0 0 12px 18px' }}>
          {TOOL_HEADER_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel[p.key]} onChange={() => toggle(p.key)} /> {p.label}{hasToolHeaderOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={reset}>Reset selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

function DonationPromptPerPagePopup({ text, size, hidden, onClose }: { text: string; size: number; hidden: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const chosen = DONATION_PROMPT_PAGES.filter((p) => sel[p.key]).map((p) => p.key);
  const allOn = chosen.length === DONATION_PROMPT_PAGES.length;
  const toggle = (k: DonationPromptScope) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(DONATION_PROMPT_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => setDonationPromptPage(k as DonationPromptScope, text, size, hidden)); onClose(); };
  const reset = () => { chosen.forEach((k) => clearDonationPromptPage(k as DonationPromptScope)); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Donation coffee cup per page</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px 12px', margin: '0 0 12px 18px' }}>
          {DONATION_PROMPT_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel[p.key]} onChange={() => toggle(p.key)} /> {p.label}{hasDonationPromptOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={reset}>Reset selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

export function AppSettingsView() {
  const app = useApp();
  // The Cards and Galleries sections each have their OWN filter (independent preview
  // selection); either one's "Apply to all pages" writes the global card setting.
  const [cLayout, setCLayout] = useState<number>(() => loadGlobalCardSize());
  const [cImg, setCImg] = useState<number>(() => loadGlobalImgSize());
  const [gLayout, setGLayout] = useState<number>(() => loadGlobalCardSize());
  const [gImg, setGImg] = useState<number>(() => loadGlobalImgSize());
  const [popup, setPopup] = useState(false);
  const [cSaved, setCSaved] = useState(false);
  const [gSaved, setGSaved] = useState(false);
  const [toolHdrSize, setToolHdrSize] = useState<number>(() => loadGlobalToolHeaderSize());
  const [toolHdrFont, setToolHdrFont] = useState<string>(() => loadGlobalToolHeaderFont());
  const [toolHdrUnderline, setToolHdrUnderline] = useState<boolean>(() => loadGlobalToolHeaderUnderline());
  const [toolHdrPopup, setToolHdrPopup] = useState(false);
  const [toolHdrSaved, setToolHdrSaved] = useState(false);
  const [donateText, setDonateText] = useState<string>(() => loadGlobalDonationPromptText());
  const [donateSize, setDonateSize] = useState<number>(() => loadGlobalDonationPromptSize());
  const [donateHidden, setDonateHidden] = useState<boolean>(() => loadGlobalDonationPromptHidden());
  const [donatePopup, setDonatePopup] = useState(false);
  const [donateSaved, setDonateSaved] = useState(false);
  const [donateEditing, setDonateEditing] = useState(false);
  const [donateBusy, setDonateBusy] = useState(false);
  const [siteRev, setSiteRev] = useState(0);
  const [registryRows, setRegistryRows] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncRunBusy, setSyncRunBusy] = useState<'' | 'pull' | 'push' | 'push-replace'>('');
  const [syncRunMsg, setSyncRunMsg] = useState('');
  const [mirrorConfirmOpen, setMirrorConfirmOpen] = useState(false);
  const [mirrorConfirmText, setMirrorConfirmText] = useState('');
  const toolHdrFontCss = TOOL_HEADER_FONTS.find((f) => f.id === toolHdrFont)?.css || TOOL_HEADER_FONTS[0].css;
  const iconBtn: React.CSSProperties = { background: 'none', border: 'none', boxShadow: 'none', padding: 0, marginLeft: 6, cursor: 'pointer', fontSize: 13, lineHeight: 1, minHeight: 0 };
  const applyCards = () => { applyCardSizeAll(cLayout); applyImgSizeAll(cImg); setCSaved(true); setTimeout(() => setCSaved(false), 1600); };
  const applyGal = () => { applyCardSizeAll(gLayout); applyImgSizeAll(gImg); setGSaved(true); setTimeout(() => setGSaved(false), 1600); };
  const applyToolHdr = () => { applyToolHeaderAll(toolHdrSize, toolHdrFont, toolHdrUnderline); setToolHdrSaved(true); setTimeout(() => setToolHdrSaved(false), 1600); };
  const applyDonate = () => { applyDonationPromptAll(donateText, donateSize, donateHidden); setDonateSaved(true); setTimeout(() => setDonateSaved(false), 1600); };
  const remixDonate = async () => {
    setDonateBusy(true);
    try {
      const r = await API.post('/api/site-settings/remix', { text: donateText, kind: 'title' });
      if (r?.text) setDonateText(String(r.text));
      else if (r?.error) alert(r.error);
    } catch {
      alert('AI unavailable — type it instead.');
    }
    setDonateBusy(false);
  };

  useEffect(() => {
    const sync = () => {
      setCLayout(loadGlobalCardSize());
      setCImg(loadGlobalImgSize());
      setGLayout(loadGlobalCardSize());
      setGImg(loadGlobalImgSize());
      setToolHdrSize(loadGlobalToolHeaderSize());
      setToolHdrFont(loadGlobalToolHeaderFont());
      setToolHdrUnderline(loadGlobalToolHeaderUnderline());
      setDonateText(loadGlobalDonationPromptText());
      setDonateSize(loadGlobalDonationPromptSize());
      setDonateHidden(loadGlobalDonationPromptHidden());
      setSiteRev((v) => v + 1);
    };
    window.addEventListener('sl-site-settings', sync);
    ensureSiteSettings();
    return () => window.removeEventListener('sl-site-settings', sync);
  }, []);

  useEffect(() => {
    if (app.user?.role !== 'admin') return;
    API.get('/api/dashboard').then((d: any) => {
      const rows = Array.isArray(d?.registry) ? d.registry : [];
      setRegistryRows(rows);
    }).catch(() => setRegistryRows([]));
  }, [app.user?.role]);

  const loadSyncStatus = async () => {
    if (app.user?.role !== 'admin') return;
    setSyncLoading(true);
    try {
      const r: any = await API.get('/api/pseudo-db/status');
      setSyncStatus(r?.status || null);
    } catch {
      setSyncStatus(null);
    }
    setSyncLoading(false);
  };

  useEffect(() => {
    if (app.user?.role !== 'admin') return;
    loadSyncStatus();
    const t = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(t);
  }, [app.user?.role]);

  const runSyncNow = async (action: 'pull' | 'push' | 'push-replace') => {
    setSyncRunBusy(action);
    setSyncRunMsg('');
    try {
      const r: any = await API.post('/api/pseudo-db/run', { action });
      if (r?.ok) {
        setSyncRunMsg(`Started ${action} job.`);
        setTimeout(() => { loadSyncStatus(); }, 1200);
      } else {
        setSyncRunMsg(r?.error || `Could not start ${action}.`);
      }
    } catch (e: any) {
      setSyncRunMsg(e?.message || `Could not start ${action}.`);
    }
    setSyncRunBusy('');
  };

  const pagesFromRegistry = (e: any): string => {
    const t = `${e?.name || ''} ${e?.description || ''} ${e?.location || ''}`.toLowerCase();
    const pages: string[] = [];
    if (/(slides|slide tool|lesson)/.test(t)) pages.push('Slides');
    if (/(repo|repository|cards)/.test(t)) pages.push('Repos');
    if (/(presentation run|runs)/.test(t)) pages.push('Presentation runs');
    if (/(moderator)/.test(t)) pages.push('Moderators');
    if (/(users|user management|author)/.test(t)) pages.push('Users');
    if (/(settings|site_settings|page text|header)/.test(t)) pages.push('Settings');
    if (/(dashboard|token|activity|registry|chart)/.test(t)) pages.push('Dashboard');
    return Array.from(new Set(pages)).join(', ') || 'Dashboard';
  };

  const dataCoverageRows: string[][] = [
    ['Slides', 'tools.json + entries.json + generated/slides/*.json', 'db:pull-json:watch or manual db:pull-json'],
    ['Repos', 'tools.json + entries.json + generated/paths/*.json', 'db:pull-json:watch or manual db:pull-json'],
    ['Presentation runs', 'entries.json + games.json', 'db:pull-json:watch or manual db:pull-json'],
    ['Moderators', 'users.json + user_tokens.json + activity.json', 'db:pull-json:watch or manual db:pull-json'],
    ['Users', 'users.json + user_tokens.json + games.json', 'db:pull-json:watch or manual db:pull-json'],
    ['Settings', 'site_settings.json + user_prefs.json + component registry', 'db:pull-json:watch or manual db:pull-json'],
    ['Dashboard', 'usage.json + activity.json + tools/entries/users/tokens/coupons', 'db:pull-json:watch or manual db:pull-json'],
  ];
  return (
    <div className="sl-settings" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        {/* Global header control for Settings: apply-to-all + per-page custom popup. */}
        <PageHeaderBar pageKey="appsettings" title="⚙️ Settings" subtitle="Tweak how SketchLearn looks." global />

        {/* Dotted line between the Settings header and the Galleries section (outside
            the header encapsulation). */}
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '4px 0 22px' }} />

        {/* ── CARDS ─────────────────────────────────────────────────────
            The card template + a "View"-style filter (like a file explorer): pick any
            arrangement — every layout/size and every image mode, INCLUDING "No image"
            (no photo at all). The blank card below previews it, and "Apply to all
            pages" changes the card everywhere on the platform. */}
        <span style={lbl}>Cards</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select title="Layout / size" aria-label="Card layout & size" value={cLayout} onChange={(e) => setCLayout(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
          </select>
          <select title="Card image" aria-label="Card image" value={cImg} onChange={(e) => setCImg(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyCards}>{cSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        {/* A BLANK card (no text, no image content) in the chosen arrangement. */}
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Blank card — {CARD_SIZE_LABELS[cLayout]} · {CARD_IMG_LABELS[cImg]}</span>
          <CardReference cardSize={cLayout} imgMode={cImg} />
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* ── GALLERIES ─────────────────────────────────────────────────
            Its OWN filter + preview of how cards look arranged in a gallery. */}
        <span style={lbl}>Galleries</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select title="Layout / size" aria-label="Gallery layout & size" value={gLayout} onChange={(e) => setGLayout(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
          </select>
          <select title="Card image" aria-label="Gallery card image" value={gImg} onChange={(e) => setGImg(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyGal}>{gSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview — {CARD_SIZE_LABELS[gLayout]} · {CARD_IMG_LABELS[gImg]}</span>
          <GallerySkeleton cardSize={gLayout} imgMode={gImg} editable />
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* Instruction banner — the wooden board, its editor + AI + apply controls. */}
        <InstructionBannerSettings key={`banner-${siteRev}`} />

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* Slide tool header — controls the presentation/tool page title style. */}
        <span style={lbl}>Slide tool header</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', marginBottom: 12 }}>
          <select title="Header font" aria-label="Slide tool header font" value={toolHdrFont} onChange={(e) => setToolHdrFont(e.target.value)} style={paperSel}>
            {TOOL_HEADER_FONTS.map((f) => <option key={f.id} value={f.id}>Aa {f.label}</option>)}
          </select>
          <button className={`btn small ${toolHdrUnderline ? 'blue' : 'ghost'}`} onClick={() => setToolHdrUnderline((v) => !v)}>
            Orange line: {toolHdrUnderline ? 'On' : 'Off'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 260, flex: '0 0 260px' }}>
            <span style={{ ...lbl, margin: 0, whiteSpace: 'nowrap' }}>Size {toolHdrSize}px</span>
            <input type="range" min={TOOL_HEADER_SIZE_MIN} max={TOOL_HEADER_SIZE_MAX} value={toolHdrSize} onChange={(e) => setToolHdrSize(parseInt(e.target.value, 10))} style={{ width: 190, accentColor: 'var(--green,#7fb069)' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'nowrap' }}>
            <button className="btn small ghost" onClick={() => setToolHdrPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyToolHdr}>{toolHdrSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview</span>
          <h2 className={toolHdrUnderline ? 'scribble-underline' : undefined} style={{ margin: 0, fontSize: toolHdrSize, lineHeight: 1.06, fontFamily: toolHdrFontCss, display: 'inline-block', textAlign: 'left' }}>
            Presentation - Basic Nutrition for Sports and Healthy Living
          </h2>
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* Donation coffee cup — text, size and visibility shared globally/per-page. */}
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', width: 'fit-content', maxWidth: '100%' }}>
          <span style={lbl}>Donation coffee cup</span>
          <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, width: 'fit-content', maxWidth: '100%' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 240, flex: '0 0 240px' }}>
              <span style={{ ...lbl, margin: 0, whiteSpace: 'nowrap' }}>Size {donateSize}px</span>
              <input type="range" min={DONATION_PROMPT_SIZE_MIN} max={DONATION_PROMPT_SIZE_MAX} value={donateSize} onChange={(e) => setDonateSize(parseInt(e.target.value, 10))} style={{ width: 160, accentColor: 'var(--green,#7fb069)' }} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
              <button className="btn small ghost" onClick={() => setDonatePopup(true)}>Customise per page…</button>
              <button className="btn small green" onClick={applyDonate}>{donateSaved ? '✓ Applied' : 'Apply to all pages'}</button>
            </div>
          </div>
          <div style={{ width: 'fit-content', maxWidth: '100%' }}>
            <div style={{ ...dashBox, width: 'fit-content', maxWidth: '100%' }}>
              <span style={{ ...lbl, marginBottom: 8 }}>Preview</span>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <DonationMug width={170} height={142} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                  {donateEditing ? (
                    <input type="text" value={donateText} onChange={(e) => setDonateText(e.target.value)} onBlur={() => setDonateEditing(false)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setDonateEditing(false); if (e.key === 'Escape') setDonateEditing(false); }}
                      style={{ ...paperSel, width: 260, minWidth: 260, maxWidth: 260, flex: '0 0 260px' }} placeholder={DONATION_PROMPT_TEXT_DEFAULT} />
                  ) : (
                    <span title={donateText} style={{ fontFamily: 'var(--font-title)', fontSize: `${donateSize}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
                      {donateText || DONATION_PROMPT_TEXT_DEFAULT}
                    </span>
                  )}
                  <button type="button" className="btn small ghost" style={iconBtn} onClick={() => setDonateEditing((v) => !v)} title="Edit text">✎</button>
                  <button type="button" className="btn small ghost" style={iconBtn} onClick={remixDonate} disabled={donateBusy} title="AI reword">{donateBusy ? '…' : '🎨'}</button>
                  <button type="button" className={`btn small ${donateHidden ? 'ghost' : 'blue'}`} style={iconBtn} onClick={() => setDonateHidden((v) => !v)} title="Hide/show donation prompt">👁</button>
                </div>
                {donateHidden && <span style={{ fontSize: 12, opacity: 0.65 }}>Hidden</span>}
              </div>
            </div>
          </div>
        </div>

        {app.user?.role === 'admin' && (
          <>
            <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />
            <span style={lbl}>Pseudo-DB status</span>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <b>Local JSON sync health</b>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn small ghost" onClick={() => runSyncNow('pull')} disabled={!!syncRunBusy}>{syncRunBusy === 'pull' ? 'Starting pull…' : 'Run pull now'}</button>
                  <button className="btn small ghost" onClick={() => runSyncNow('push')} disabled={!!syncRunBusy}>{syncRunBusy === 'push' ? 'Starting push…' : 'Run push now'}</button>
                  <button className="btn small ghost" onClick={() => { setMirrorConfirmText(''); setMirrorConfirmOpen(true); }} disabled={!!syncRunBusy} title="Full mirror push that deletes DB rows missing from JSON.">{syncRunBusy === 'push-replace' ? 'Starting mirror…' : 'Run push mirror'}</button>
                  <button className="btn small ghost" onClick={loadSyncStatus} disabled={syncLoading}>{syncLoading ? 'Refreshing…' : 'Refresh'}</button>
                </div>
              </div>
              {syncRunMsg && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.8 }}>{syncRunMsg}</p>}
              {!syncStatus ? (
                <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>No sync status yet. Run db:pull-json, db:push-json, or db:pull-json:watch once.</p>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.85, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 8 }}>
                  <div><b>State:</b> {syncStatus.running ? 'Running' : (syncStatus.ok ? 'Healthy' : 'Error')}</div>
                  <div><b>Mode:</b> {syncStatus.mode || '—'}</div>
                  <div><b>Replace:</b> {syncStatus.replaceMode ? 'Yes' : 'No'}</div>
                  <div><b>Started:</b> {syncStatus.startedAt ? new Date(syncStatus.startedAt).toLocaleString() : '—'}</div>
                  <div><b>Finished:</b> {syncStatus.finishedAt ? new Date(syncStatus.finishedAt).toLocaleString() : '—'}</div>
                  <div><b>Error:</b> {syncStatus.error || '—'}</div>
                </div>
              )}
            </div>

            <span style={lbl}>Data sync coverage</span>
            <div className="card" style={{ marginBottom: 12 }}>
              <PagedTable
                compact
                headers={['Page', 'Pseudo-DB source', 'Recurring sync']}
                rows={dataCoverageRows}
                empty="No coverage rows."
              />
            </div>

            <span style={lbl}>Reusable components inventory</span>
            <div className="card alt" style={{ marginBottom: 10 }}>
              <PagedTable
                compact
                headers={['Name', 'Function', 'Pages used', 'Type', 'Uses']}
                rows={registryRows.map((e: any) => [
                  e.name || '—',
                  e.description || '—',
                  pagesFromRegistry(e),
                  e.kind || 'component',
                  String(e.uses || 0),
                ])}
                empty="No components loaded yet."
              />
              <p style={{ fontSize: 11, opacity: 0.65, margin: '8px 0 0' }}>
                This table is sourced from the registry used by Dashboard and kept in local pseudo-DB workflows.
              </p>
            </div>
          </>
        )}
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
      {toolHdrPopup && <ToolHeaderPerPagePopup size={toolHdrSize} font={toolHdrFont} underline={toolHdrUnderline} onClose={() => setToolHdrPopup(false)} />}
      {donatePopup && <DonationPromptPerPagePopup text={donateText} size={donateSize} hidden={donateHidden} onClose={() => setDonatePopup(false)} />}
      {mirrorConfirmOpen && (
        <div onClick={() => setMirrorConfirmOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>Confirm mirror push</b>
              <button className="btn small ghost" onClick={() => setMirrorConfirmOpen(false)}>✕</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.82, margin: '0 0 8px' }}>
              This action performs a full JSON to DB mirror and deletes database rows not present in local JSON files.
            </p>
            <p style={{ fontSize: 12, margin: '0 0 8px' }}>
              Type <b>{MIRROR_CONFIRM_PHRASE}</b> to continue.
            </p>
            <input
              type="text"
              autoFocus
              value={mirrorConfirmText}
              onChange={(e) => setMirrorConfirmText(e.target.value)}
              placeholder={MIRROR_CONFIRM_PHRASE}
              style={{ width: '100%', marginBottom: 10 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mirrorConfirmText.trim() === MIRROR_CONFIRM_PHRASE && !syncRunBusy) {
                  setMirrorConfirmOpen(false);
                  runSyncNow('push-replace');
                }
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn small ghost" onClick={() => setMirrorConfirmOpen(false)}>Cancel</button>
              <button
                className="btn small blue"
                disabled={mirrorConfirmText.trim() !== MIRROR_CONFIRM_PHRASE || !!syncRunBusy}
                onClick={() => {
                  setMirrorConfirmOpen(false);
                  runSyncNow('push-replace');
                }}
              >
                Confirm mirror push
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

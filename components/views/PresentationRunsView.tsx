'use client';
/* Presentation runs — a GENERIC empty-state view (like Sandbox / Empty) that shows
 * how a presentation gallery looks before there's data: the gallery skeleton (a
 * "make/play one" card + a recommended presentation + pager) inside the shell
 * working column. The presentation-specific tool — the "Make a slide presentation"
 * settings form — lives behind the ⚙️ gear in the filter row (and the CTA button),
 * opening as a popup. This is what makes it different from the Slides gallery. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState, LEVELS, TONES } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { useCardSize, useImgSize } from '@/lib/card-size';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { GalleryFilterRow } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';

function SlideSettings({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [topic, setTopic] = useState('');
  const [slides, setSlides] = useState(5);
  const [level, setLevel] = useState('Lower Intermediate');
  const [tone, setTone] = useState('Friendly lecture');
  const [textProv, setTextProv] = useState('gemini');
  const [imgProv, setImgProv] = useState('');
  const [textProviders, setTextProviders] = useState<{ id: string; label: string }[]>([]);
  const [imageProviders, setImageProviders] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    API.get('/api/config').then((c: any) => {
      setTextProviders(Array.isArray(c?.textProviders) ? c.textProviders : []);
      setImageProviders(Array.isArray(c?.imageProviders) ? c.imageProviders : []);
    }).catch(() => { /* ignore */ });
  }, []);

  const build = () => {
    if (!app.user) { app.requireLogin(); return; }
    const subject = topic.trim() || 'New presentation';
    appState.builderSeed = {
      artifact: 'presentation', subject, title: subject, tone,
      context: `Level: ${level}. About ${slides} slides. Text model: ${textProv}${imgProv ? `, image model: ${imgProv}` : ''}.`,
    };
    app.nav('toolbuilder');
  };

  const sel: React.CSSProperties = { width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'block' };
  return (
    <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', padding: '16px 18px', margin: '4vh 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b>🎬 Make a slide presentation</b><button className="btn small ghost" onClick={onClose}>✕</button>
      </div>
      <div className="settings-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>Topic</span>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, French greetings…" style={sel} /></label>
        <label><span style={lbl}>Slides</span>
          <input type="number" min={1} max={30} value={slides} onChange={(e) => setSlides(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 5)))} style={sel} /></label>
        <label><span style={lbl}>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={sel}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label><span style={lbl}>Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={sel}>{TONES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label><span style={lbl}>Text API</span>
          <select value={textProv} onChange={(e) => setTextProv(e.target.value)} style={sel}>
            <option value="gemini">Gemini (default)</option>
            {textProviders.filter((p) => p.id !== 'gemini').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
        <label><span style={lbl}>Image API</span>
          <select value={imgProv} onChange={(e) => setImgProv(e.target.value)} style={sel}>
            <option value="">Auto</option>
            {imageProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn green" onClick={build}>Build presentation →</button>
      </div>
    </div>
  );
}

export function PresentationRunsView() {
  const app = useApp();
  const [rec, setRec] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cardSize = useCardSize('presrun');
  const imgMode = useImgSize('presrun');

  useEffect(() => {
    let alive = true;
    API.get('/api/tools').then((r: any) => {
      if (!alive) return;
      const all = Array.isArray(r?.tools) ? r.tools : [];
      const lessons = all.filter((t: any) => (t?.archetype || t?.definition?.archetype) === 'lesson');
      setRec(lessons.find((t: any) => (t.tags || []).includes('example')) || lessons[0] || null);
    }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, []);

  const openRec = async (t: any) => {
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    app.nav('tool');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeaderBar pageKey="presrun" title="🎬 Presentation runs" subtitle="Set up a new presentation, or open one of the slide tools." />

        {/* The ⚙️ gear opens the "Make a slide presentation" form as a popup. */}
        <GalleryFilterRow right={<>
          <button className="btn small ghost" title="Make a slide presentation" aria-label="Make a slide presentation"
            onClick={() => setSettingsOpen(true)} style={{ fontSize: 16, padding: '0 9px' }}>⚙️</button>
          <CardViewMenu pageKey="presrun" />
        </>} />

        {/* The generic empty-state skeleton; "Build one" opens the settings form. */}
        <GallerySkeleton cardSize={cardSize} imgMode={imgMode} recommended={rec} onBuild={() => setSettingsOpen(true)} onOpen={openRec} />
      </div>

      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <SlideSettings onClose={() => setSettingsOpen(false)} />
        </div>
      )}
    </div>
  );
}

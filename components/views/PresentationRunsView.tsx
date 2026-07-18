'use client';
/* Presentation runs — the slide-tool page adapted to the new shell layout: the
 * settings to make a slide presentation on top, then the gallery of every slide
 * tool (the shared ShellGallery, with the same cards / filters / edit controls /
 * data table). "Build presentation" seeds the Studio with these settings. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState, LEVELS, TONES } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ShellGallery } from '@/components/views/ShellGallery';

function SlideSettings() {
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
      artifact: 'presentation',
      subject,
      title: subject,
      tone,
      context: `Level: ${level}. About ${slides} slides. Text model: ${textProv}${imgProv ? `, image model: ${imgProv}` : ''}.`,
    };
    app.nav('toolbuilder');
  };

  const sel: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', font: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'block' };

  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 18 }}>
      <b style={{ display: 'block', marginBottom: 10 }}>🎬 Make a slide presentation</b>
      <div className="settings-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>Topic</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, French greetings…" style={sel} /></label>
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
  return (
    <ShellGallery kind="presentation" title="🎬 Presentation runs" subtitle="Set up a new presentation, or open one of the slide tools"
      topSlot={<SlideSettings />} />
  );
}

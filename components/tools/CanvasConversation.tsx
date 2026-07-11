'use client';
/* Two annotation-pad lesson MODES that grow a conversation/journal instead of a
 * fixed slide deck:
 *   - 'conversation': write or draw a message on the pad, send it, and the AI's
 *     reply appears at the top (a chat with the annotation toolkit). Exit any
 *     time to get an AI recap and publish the whole thing as a feed post.
 *   - 'journal': no AI — write pages, save them, and publish the collection.
 * There is no set length; the "limit" is when you choose to exit and publish. */
import { useRef, useState } from 'react';
import { API } from '@/lib/api';
import { AnnotationPad, compositePages } from '@/components/tools/AnnotationPad';

type Turn = { role: 'user' | 'assistant'; text?: string; image?: string };

export function CanvasConversation({ def, slug }: { def: any; slug: string }) {
  const lesson = def?.lesson || {};
  const mode: 'conversation' | 'journal' = lesson.mode === 'journal' ? 'journal' : 'conversation';
  const subject = String(lesson.subject || def?.title || 'Notes');
  const isJournal = mode === 'journal';

  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<'chat' | 'done'>('chat');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const [published, setPublished] = useState<null | { ok: boolean; msg: string }>(null);
  const [padKey, setPadKey] = useState(0);         // bump to remount = clear the pad
  const getPagesRef = useRef<null | (() => string[])>(null);
  const [hasInk, setHasInk] = useState(false);

  const collect = async (): Promise<string> => {
    const pages = (getPagesRef.current ? getPagesRef.current() : []).filter(Boolean);
    return pages.length ? compositePages(pages) : '';
  };
  const resetPad = () => { setPadKey(k => k + 1); setHasInk(false); getPagesRef.current = null; };

  // conversation: send my written message, get the tutor's reply at the top.
  const send = async () => {
    if (busy) return;
    const image = await collect();
    if (!image) { alert('Write or draw your message first.'); return; }
    setBusy(true);
    const mine: Turn = { role: 'user', image };
    const history = [...turns, mine].map(t => ({ role: t.role, text: t.text || (t.role === 'user' ? '[hand-written message]' : '') }));
    setTurns(t => [...t, mine]);
    resetPad();
    try {
      const r = await API.post('/api/tools/lesson/canvas-chat', { subject, history, image }, { retries: 2 });
      setTurns(t => [...t, { role: 'assistant', text: r?.reply || 'Got it.' }]);
    } catch (e: any) {
      setTurns(t => [...t, { role: 'assistant', text: `(Could not reach the tutor: ${e?.message || 'try again'})` }]);
    }
    setBusy(false);
  };

  // journal: save the current page into the collection.
  const savePage = async () => {
    if (busy) return;
    const image = await collect();
    if (!image) { alert('Write something first.'); return; }
    setTurns(t => [...t, { role: 'user', image }]);
    resetPad();
  };

  // Exit any time: recap (conversation) then move to the publish screen.
  const exit = async () => {
    if (busy) return;
    // Fold any unsaved ink into the record before we finish.
    const pending = await collect();
    const all = pending ? [...turns, { role: 'user' as const, image: pending }] : turns;
    if (!all.length) { alert(isJournal ? 'Write a page first.' : 'Say something first.'); return; }
    setTurns(all); resetPad(); setBusy(true);
    if (isJournal) {
      setReport(''); setBusy(false); setPhase('done'); return;
    }
    try {
      const history = all.map(t => ({ role: t.role, text: t.text || '[hand-written message]' }));
      const r = await API.post('/api/tools/lesson/canvas-report', { subject, history }, { retries: 2 });
      setReport(r?.report || '');
    } catch { setReport(''); }
    setBusy(false); setPhase('done');
  };

  const publish = async (visibility = 'public') => {
    setBusy(true); setPublished(null);
    try {
      const imgs = turns.filter(t => t.image).map(t => t.image!) as string[];
      let image = imgs.length ? await compositePages(imgs) : '';
      if (image.length > 480000) image = ''; // too big to post inline; keep the text
      const title = `${isJournal ? '📓 Journal' : '💬 Canvas chat'} — ${subject}`.slice(0, 110);
      const body = (report || (isJournal ? `A hand-written journal: ${subject}.` : `A hand-written conversation about ${subject}.`)).slice(0, 1900);
      await API.post('/api/posts', { title, body, image }, { retries: 1 });
      // Also record it on the tool's own activity feed.
      try { await API.post('/api/tools/entries', { slug, data: { title, note: body } }); } catch { /* ignore */ }
      setPublished({ ok: true, msg: 'Published to the Feed 🎉' });
    } catch (e: any) {
      setPublished({ ok: false, msg: e?.message || 'Could not publish.' });
    }
    setBusy(false);
  };

  const restart = () => { setTurns([]); setReport(''); setPublished(null); setPhase('chat'); resetPad(); };

  // -------- DONE / publish screen --------
  if (phase === 'done') {
    const imgs = turns.filter(t => t.image).map(t => t.image!) as string[];
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <h3 style={{ marginTop: 0 }}>{isJournal ? '📓 Your journal' : '💬 Conversation recap'}</h3>
          {report && <p style={{ fontSize: 15, lineHeight: 1.6 }}>{report}</p>}
          {!report && isJournal && <p style={{ fontSize: 14, opacity: 0.75 }}>{turns.filter(t => t.image).length} page(s) written.</p>}
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {imgs.map((src, i) => <img key={i} src={src} alt={`page ${i + 1}`} style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 8 }} />)}
          </div>
          {published ? (
            <p style={{ marginTop: 12, fontWeight: 600, color: published.ok ? 'var(--accent,#5c80bc)' : 'var(--danger,#e4572e)' }}>{published.msg}</p>
          ) : (
            <div className="slide-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn green" disabled={busy} onClick={() => publish()}>{busy ? 'Publishing…' : '📮 Publish to Feed'}</button>
              <button className="btn" disabled={busy} onClick={restart}>↻ New {isJournal ? 'journal' : 'chat'}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------- CHAT / journal writing screen --------
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <strong>{isJournal ? '📓' : '💬'} {subject}</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{isJournal ? 'Write pages, then publish' : 'Write, send, and read the reply on top'}</span>
      </div>

      {/* Transcript / saved pages — the AI reply shows here at the top. */}
      {turns.length > 0 && (
        <div style={{ maxHeight: '34vh', overflowY: 'auto', border: '1.5px dashed var(--ink)', borderRadius: 10, padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.02)' }}>
          {turns.map((t, i) => t.role === 'assistant' ? (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%', background: 'var(--card,#fff)', border: '1.5px solid var(--ink)', borderRadius: 10, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>✦ TUTOR</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.text}</div>
            </div>
          ) : (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textAlign: 'right' }}>{isJournal ? `PAGE ${turns.filter((x, j) => x.image && j <= i).length}` : 'YOU WROTE'}</div>
              {t.image && <img src={t.image} alt="your message" style={{ width: '100%', maxWidth: 220, border: '2px solid var(--ink)', borderRadius: 8, display: 'block', marginLeft: 'auto' }} />}
            </div>
          ))}
          {busy && !isJournal && <div style={{ alignSelf: 'flex-start', fontSize: 13, opacity: 0.6 }}>✦ tutor is reading…</div>}
        </div>
      )}

      {/* The writing surface — half-screen, grows downward. */}
      <AnnotationPad key={padKey} scroll onReady={fn => { getPagesRef.current = fn; }} onChange={() => setHasInk(true)} />

      <div className="slide-actions" style={{ justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {isJournal
          ? <button className="btn blue" disabled={busy || !hasInk} onClick={savePage}>＋ Save page</button>
          : <button className="btn green" disabled={busy || !hasInk} onClick={send}>{busy ? 'Sending…' : '➤ Send to tutor'}</button>}
        <button className="btn" disabled={busy} onClick={exit}>🏁 Exit &amp; publish</button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}>
        No set length — {isJournal ? 'add as many pages as you like' : 'chat as long as you like'}, then exit to publish.
      </p>
    </div>
  );
}

'use client';
/* RepoChatComposer — the "create a repository from a description" composer on the
 * Repos gallery, in SketchLearn's hand-made style (dashed-ink border, paper fill,
 * sketch font).
 *
 *   • ＋  attaches files (shown as chips; captured locally, not uploaded yet).
 *   • The prompt is a real text box.
 *   • Below the box: a single toggleable "🎬 Lesson Path" pill (OFF by default).
 *     The AI decides the number of units from the prompt — there is no Units control.
 *   • ↑  (or ⌘/Ctrl+Enter) opens the repo builder with the typed prompt. Lesson Path
 *     OFF → an EMPTY builder (you generate the repo yourself). Lesson Path ON →
 *     pre-builds the repo AND its presentation for you to review and confirm. */
import { useRef, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { appState } from '@/lib/app-state';

const circleBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', flex: '0 0 auto', padding: 0, background: 'transparent',
};

type DocItem = { name: string; text?: string; dataUrl?: string };

export function RepoChatComposer({ variant = 'repository' }: { variant?: 'repository' | 'presentation' }) {
  const app = useApp();
  const isRepo = variant === 'repository';
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<DocItem[]>([]);   // name + READ content
  const [lessonPath, setLessonPath] = useState(false);   // default OFF (repo only)
  const fileRef = useRef<HTMLInputElement | null>(null);
  const heading = isRepo ? '✨ Create a repo' : '✨ Create a slide activity';
  const placeholder = isRepo
    ? 'Describe the repository you want to build — its sections, cards, links and access settings…'
    : 'Describe the slide activity you want to build — its topic, level, tone and how many slides…';
  const hint = isRepo ? 'Chat to generate a repository with its settings' : 'Chat to generate a slide presentation';

  // Read each attached file's CONTENT (text inline, PDF/binary as a data URL) so the
  // AI actually builds FROM the document — not just from its file name.
  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files).slice(0, 6)) {
      if (f.size > 20_000_000) continue;
      const item: DocItem = { name: f.name };
      const isText = /text|json|markdown/.test(f.type) || /\.(txt|md|csv)$/i.test(f.name);
      if (isText) item.text = await f.text();
      else item.dataUrl = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
      setAttachments((prev) => [...prev, item].slice(0, 6));
    }
  };

  // Hand off to the editable repo builder, preset with the typed prompt + a short
  // note of the chosen options so they survive into the "ORIGINAL REPO PROMPT" box.
  const generate = () => {
    const prompt = text.trim();
    if (!prompt) return;
    if (!app.user) { app.requireLogin(); return; }
    const hasDoc = attachments.length > 0;
    const what = isRepo ? 'repository' : 'slide presentation';
    const note = `\n\n[${isRepo ? 'Repo' : 'Presentation'} settings] ${isRepo ? `Type: ${lessonPath ? 'Learning Path' : 'Normal Repo'}` : 'Type: Slide activity'}${attachments.length ? ` · Attachments: ${attachments.map((a) => a.name).join(', ')}` : ''}`;
    const seedText = prompt + note;
    // The AI decides the details from the prompt itself. Auto-build when a document
    // is attached (or, for repos, when Lesson Path is on) — otherwise open the
    // builder with the prompt. The attached documents' CONTENT is carried through.
    (appState as any).builderSeed = {
      artifact: isRepo ? 'repository' : 'presentation',
      sourcePrompt: seedText,
      context: `${prompt}${hasDoc ? ` Base the ${what} strictly on the attached document(s).` : ''}${isRepo && lessonPath ? ' Structure it as a learning path.' : ''}`,
      subject: prompt.slice(0, 120),
      title: prompt.slice(0, 120),
      docs: attachments.map((a) => ({ name: a.name, text: a.text, dataUrl: a.dataUrl })),
      autoSuggest: (isRepo && lessonPath) || hasDoc,
      ...(isRepo ? { lessonPath } : {}),   // repo only: also pre-build the presentation
    };
    app.nav('toolbuilder');
  };

  const pill = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
    padding: '5px 13px', borderRadius: 999, cursor: 'pointer', border: '2px solid var(--ink,#2d2a26)',
    background: active ? 'var(--green,#7fb069)' : 'transparent', color: active ? '#fff' : 'var(--ink,#2d2a26)',
  });

  return (
    <div style={{ margin: '2px 0 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px' }}>
        {heading}
      </div>

      <div style={{
        border: '2.5px dashed var(--ink,#2d2a26)', borderRadius: 'var(--wobble-2, 16px)',
        background: 'var(--paper,#fbf7ee)', padding: '12px 14px 10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Attachment chips — the file's CONTENT is read and carried to the builder. */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {attachments.map((doc, i) => (
              <span key={`${doc.name}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                border: '2px solid var(--ink,#2d2a26)', borderRadius: 999, padding: '3px 6px 3px 10px', background: 'rgba(0,0,0,0.04)' }}>
                📎 {doc.name.length > 26 ? doc.name.slice(0, 25) + '…' : doc.name}
                <button type="button" title="Remove" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.7 }}>✕</button>
              </span>
            ))}
          </div>
        )}

        {/* The prompt — a real text box, borderless so it blends into the dashed card. */}
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } }}
          placeholder={placeholder}
          rows={2}
          style={{ border: 'none', background: 'transparent', boxShadow: 'none', outline: 'none', resize: 'vertical',
            minHeight: 44, fontSize: 15, lineHeight: 1.35, padding: 0, width: '100%', fontFamily: 'inherit' }} />

        {/* A very faint dotted rule so the write area and the controls read as two
            distinct zones. */}
        <div style={{ borderTop: '1px dotted var(--ink,#2d2a26)', opacity: 0.18 }} />

        {/* Controls row: ＋ (attach) on the left, send ↑ on the right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={(e) => { onFiles(e.target.files); if (e.currentTarget) e.currentTarget.value = ''; }} />
          <button type="button" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}
            style={{ ...circleBtn, width: 32, height: 32, color: 'var(--ink,#2d2a26)' }}>＋</button>
          <span style={{ fontSize: 12, opacity: 0.5 }}>{hint}</span>
          <button type="button" title={isRepo ? 'Generate the editable repo' : 'Generate the editable slide activity'} aria-label="Send" onClick={generate}
            style={{ ...circleBtn, marginLeft: 'auto', background: 'var(--green,#7fb069)', color: '#fff', fontSize: 16 }}>↑</button>
        </div>
      </div>

      {/* Option row BELOW the chat, indented a tab from the left — the Lesson Path
          toggle (repo only; off by default; the AI decides the number of units). */}
      {isRepo && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 22, flexWrap: 'wrap' }}>
          <button type="button" aria-pressed={lessonPath} onClick={() => setLessonPath((v) => !v)}
            title={lessonPath ? 'Lesson Path is on — pre-builds the repo AND its presentation; 🔵 prompt cards generate lessons' : 'Lesson Path is off — opens an empty builder with your prompt; generate the repo yourself'}
            style={pill(lessonPath)}>
            🎬 Lesson Path
          </button>
        </div>
      )}
    </div>
  );
}

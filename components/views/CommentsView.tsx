'use client';
/* Comments — a dedicated nav page for the discussion/comment design (like the Empty
 * page, but for comments). It shows a worked EXAMPLE we can iterate the design on: a
 * chain of three back-to-back posts (a thread) and three "respected" responses. */
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';

const AV = ['🦊', '🦉', '🐛', '🤖', '🎨', '🔧', '📊', '🗣️'];
function avatarFor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { emoji: AV[h % AV.length], color: `hsl(${h % 360} 55% 52%)` };
}

// A chain of three back-to-back posts from the same author (a thread).
const THREAD = [
  { author: 'Ada', time: '2h', text: 'Just published a French greetings slide deck — feedback welcome! 🎉' },
  { author: 'Ada', time: '2h', text: 'Follow-up: added audio for every phrase so you can hear the pronunciation.' },
  { author: 'Ada', time: '1h', text: 'And a quick quiz at the end to test yourself — that completes the mini-course.' },
];

// Three "respected" responses (highlighted, with a badge + vote count).
const RESPONSES = [
  { author: 'Marco', time: '1h', text: 'This is fantastic — the audio really helps it click. Respected work! 👏', votes: 24 },
  { author: 'Lena', time: '55m', text: 'Used it with my students today and they loved the quiz at the end.', votes: 18 },
  { author: 'Sofia', time: '40m', text: 'Clean layout and clear examples. Bookmarked for my own study. 📌', votes: 12 },
];

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const av = avatarFor(name);
  return <span style={{ flex: '0 0 auto', width: size, height: size, borderRadius: '50%', background: av.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.5, border: '2px solid var(--ink)' }}>{av.emoji}</span>;
}

export function CommentsView() {
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeaderBar pageKey="comments" title="💬 Comments" subtitle="A worked example of the discussion design." />

        {/* The thread: three chained back-to-back posts linked by a dotted rail. */}
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 8px', display: 'block' }}>Thread</span>
        <div>
          {THREAD.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              {/* Avatar + the connecting rail between posts. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Avatar name={p.author} />
                {i < THREAD.length - 1 && <span style={{ flex: 1, width: 0, borderLeft: '2px dashed var(--line,#d9cfc0)', minHeight: 16, margin: '4px 0' }} />}
              </div>
              <div className="card" style={{ flex: 1, minWidth: 0, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 13, marginBottom: 3 }}><b>{p.author}</b> <span style={{ color: 'var(--muted,#8a7f70)', fontSize: 12 }}>· {p.time}</span></div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{p.text}</p>
              </div>
            </div>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0' }} />

        {/* Three respected responses. */}
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 8px', display: 'block' }}>⭐ Respected responses</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RESPONSES.map((r, i) => (
            <div key={i} className="card" style={{ display: 'flex', gap: 12, padding: '10px 14px', borderLeft: '3px solid var(--green,#7fb069)' }}>
              <Avatar name={r.author} size={36} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <b style={{ fontSize: 13 }}>{r.author}</b>
                  <span style={{ color: 'var(--muted,#8a7f70)', fontSize: 12 }}>· {r.time}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green,#4e7a3a)', border: '1.5px solid var(--green,#7fb069)', borderRadius: 999, padding: '1px 8px' }}>⭐ Respected</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{r.text}</p>
                <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5, color: 'var(--muted,#8a7f70)' }}>
                  <span>▲ {r.votes}</span>
                  <button className="btn small ghost" style={{ padding: '1px 9px' }}>Reply</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Deterministic dummy-feed generator. Produces a stable set of AI-labelled
 * social posts (text, text+image, and tool-publication style) so the feed feels
 * alive before real users post. Seeded PRNG => the same posts every run, so
 * per-user "seen" tracking + the morph engine stay consistent across requests.
 *
 * EVERYTHING here is clearly flagged aiGenerated:true; the UI shows a badge. */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function intBetween(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

const AUTHORS = [
  { handle: 'sketch_sam', name: 'Sam Rivera', emoji: '🦊', color: '#f9a03f' },
  { handle: 'data_deb', name: 'Deborah Ok', emoji: '📊', color: '#5c80bc' },
  { handle: 'nullbyte_nia', name: 'Nia Chen', emoji: '🐛', color: '#7fb069' },
  { handle: 'prof_kade', name: 'Kade Owusu', emoji: '🦉', color: '#e4572e' },
  { handle: 'ml_maya', name: 'Maya Solis', emoji: '🤖', color: '#9b5de5' },
  { handle: 'ops_omar', name: 'Omar Haddad', emoji: '⚙️', color: '#00b4d8' },
  { handle: 'lingo_lu', name: 'Lu Fang', emoji: '🗣️', color: '#f15bb5' },
  { handle: 'redteam_rae', name: 'Rae Kovac', emoji: '🛡️', color: '#2d6a4f' },
  { handle: 'builder_bo', name: 'Bo Ferreira', emoji: '🔧', color: '#ff8fab' },
  { handle: 'quant_qi', name: 'Qi Zhang', emoji: '📈', color: '#3a86ff' },
  { handle: 'teacher_tess', name: 'Tess Moran', emoji: '✏️', color: '#fb8500' },
  { handle: 'cloud_cy', name: 'Cy Delacroix', emoji: '☁️', color: '#48cae4' },
  { handle: 'pixel_pia', name: 'Pia Novak', emoji: '🎨', color: '#e07a5f' },
  { handle: 'sec_soren', name: 'Soren Lund', emoji: '🔐', color: '#264653' },
  { handle: 'notes_nate', name: 'Nate Ellis', emoji: '📝', color: '#8338ec' },
  { handle: 'flow_farah', name: 'Farah Aziz', emoji: '🌊', color: '#06d6a0' },
];

const SUBJECTS = [
  'a CVE dashboard', 'a spaced-repetition planner', 'a flight-deal watcher', 'a habit tracker',
  'an ESL lesson library', 'a crypto portfolio board', 'a launch-countdown page', 'a journaling tool',
  'a MITRE ATT&CK mapper', 'a recipe + shopping-list app', 'a contest submission portal',
  'a reading-level analyzer', 'a standup-notes generator', 'a weather-alert map', 'a podcast tracker',
  'a study-group scheduler', 'a phishing-report intake form', 'a data-viz gallery',
];

const TEXT_TEMPLATES = [
  'Hot take: the best tool is the one you actually finish. Shipped {subj} in an afternoon instead of "planning" it for a month.',
  'Reminder that a settings form + one AI prompt gets you 80% of the way to {subj}. Stop over-engineering.',
  'Spent the week on {subj}. The hardest part was never the code — it was deciding what to leave out.',
  'If you can describe {subj} in two sentences, you can probably build it today. That realization changed how I work.',
  'Productivity isn\'t doing more, it\'s removing steps. {subj} saved me ~20 minutes a day and that compounds.',
  'Teaching thought: learners don\'t need more content, they need the *next* right step. Built {subj} around exactly that.',
  'Small win: connected a data source to {subj} and suddenly it feels like a real product, not a toy.',
  'Unpopular opinion — most "dashboards" are just a table nobody scrolls. {subj} works because it answers ONE question.',
  'The moment {subj} started saving other people time too, it stopped being a side project.',
  'Note to self and anyone building {subj}: ship the ugly version, get one user, then make it pretty.',
];

const TOOL_TEMPLATES = [
  'Just published {subj} — feedback welcome! It takes a topic + a level and generates the rest.',
  'New tool: {subj}. Fork it, remix it, break it. That\'s the point.',
  'Made {subj} for my own workflow, then realized others might want it. It\'s public now.',
  'Shipped {subj}. Set it to unlisted for a week, ironed out the rough edges, going public today.',
];

const COMMENT_TEMPLATES = [
  'This is exactly what I needed, thank you!', 'How did you handle the data source?',
  'Forking this right now.', 'Clean. Does it export to PDF?', 'The "leave things out" part hits hard.',
  'Been looking for something like {subj} for ages.', 'Would love a dark theme for this.',
  'Simple and it works — my favorite combo.', 'Any plans to add notifications?', 'Saved. Great write-up.',
];

const TAG_POOL = ['productivity', 'education', 'cybersecurity', 'data', 'ai', 'travel', 'finance', 'language', 'no-code', 'dashboard'];

// A tiny hand-sketched SVG "card" as a data URL, so image posts have something to show
// with zero external requests. Title text is drawn onto a paper-toned panel.
function sketchImage(title, color) {
  const safe = String(title).replace(/[<&>]/g, '').slice(0, 42);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='240' viewBox='0 0 480 240'>
<rect width='480' height='240' fill='#f7f3e9'/>
<rect x='10' y='10' width='460' height='220' rx='14' fill='none' stroke='#2d2a26' stroke-width='3'/>
<circle cx='58' cy='58' r='22' fill='${color}' stroke='#2d2a26' stroke-width='3'/>
<line x1='96' y1='52' x2='420' y2='52' stroke='#2d2a26' stroke-width='4' stroke-linecap='round'/>
<line x1='96' y1='70' x2='360' y2='70' stroke='#c8c2b4' stroke-width='4' stroke-linecap='round'/>
<text x='34' y='150' font-family='Georgia, serif' font-size='22' fill='#2d2a26'>${safe}</text>
<line x1='34' y1='172' x2='300' y2='172' stroke='${color}' stroke-width='5' stroke-linecap='round'/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate n deterministic posts. Default 100.
function generateDummyPosts(n = 100) {
  const rng = mulberry32(20240711);
  const now = Date.now();
  const posts = [];
  for (let i = 0; i < n; i++) {
    const author = pick(rng, AUTHORS);
    const subj = pick(rng, SUBJECTS);
    const roll = rng();
    const kind = roll < 0.45 ? 'text' : roll < 0.75 ? 'image' : 'tool';
    const isTool = kind === 'tool';
    const template = isTool ? pick(rng, TOOL_TEMPLATES) : pick(rng, TEXT_TEMPLATES);
    const body = template.replace('{subj}', subj);
    const title = isTool ? subj.replace(/^an? /, '').replace(/\b\w/, c => c.toUpperCase()) : '';
    const createdAt = new Date(now - intBetween(rng, 1, 30 * 24 * 60) * 60 * 1000).toISOString();

    const nComments = intBetween(rng, 0, 4);
    const comments = [];
    for (let c = 0; c < nComments; c++) {
      const ca = pick(rng, AUTHORS);
      comments.push({
        id: `dummy-${i}-c${c}`,
        author: { handle: ca.handle, name: ca.name, avatar: { emoji: ca.emoji, color: ca.color } },
        body: pick(rng, COMMENT_TEMPLATES).replace('{subj}', subj),
        aiGenerated: true,
        createdAt: new Date(new Date(createdAt).getTime() + intBetween(rng, 5, 600) * 60 * 1000).toISOString(),
      });
    }

    posts.push({
      id: `dummy-${i}`,
      kind,
      author: { handle: author.handle, name: author.name, avatar: { emoji: author.emoji, color: author.color } },
      title,
      body,
      image: kind === 'image' ? sketchImage(subj, author.color) : null,
      tool: isTool ? { title, tags: Array.from(new Set([pick(rng, TAG_POOL), pick(rng, TAG_POOL)])) } : null,
      likeCount: intBetween(rng, 0, 480),
      commentCount: nComments,
      comments,
      aiGenerated: true,
      createdAt,
    });
  }
  return posts;
}

module.exports = { generateDummyPosts };

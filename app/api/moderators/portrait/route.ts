import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { imageEnabled, geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateImageWithMeta, generateSvgSketch, getLastImageError } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { NO_TEXT_RULE } from '@/lib/image-styles';
import { readGames } from '@/src/db/games';
import { userState, loadUsers } from '@/src/db/users';
import { db } from '@/src/db/pool';
import { recordImageUsage } from '@/lib/usage-log';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserPrefs, setUserPref, getUserTokens } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

const PROFILE_KEY = 'moderatorProfile';

// A deliberately broad, respectful spread so repeated generations vary — the
// requirement is that the imagined portrait uses a DIFFERENT ethnicity each time.
const ETHNICITIES = [
  'West African', 'East African', 'North African', 'Southern African',
  'East Asian', 'South Asian', 'Southeast Asian', 'Central Asian',
  'Middle Eastern', 'Pacific Islander', 'Indigenous Australian',
  'Northern European', 'Southern European', 'Eastern European',
  'Latin American / Hispanic', 'Caribbean', 'Indigenous American',
  'mixed-race / multiethnic',
];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

async function freshUsers() {
  if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
  return userState.users;
}

// POST { username } -> { url, profile }
// Generates an imagined portrait of the moderator from what we know about them
// (name, their card copy/interests, lesson history, generations and token balance)
// and saves it as their profile image. Owner or admin only. Each call picks a new
// random ethnicity so the portraits are diverse.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const username = String(b.username || '').trim();
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
  if (!(a.user.role === 'admin' || a.user.username === username)) {
    return NextResponse.json({ error: 'Only the moderator or an admin can set this portrait.' }, { status: 403 });
  }
  const users = await freshUsers();
  const target = (users as any[]).find((u) => u.username === username);
  if (!target || !(target.role === 'moderator' || target.role === 'admin')) {
    return NextResponse.json({ error: 'Not a moderator.' }, { status: 404 });
  }

  if (!imageEnabled && !geminiEnabled && !openrouterEnabled && !deepseekEnabled && !moonshotEnabled) {
    return NextResponse.json({ error: 'No image model is configured.' }, { status: 200 });
  }

  // Gather what we know about this person to inform the imagined portrait.
  const prof = (await getUserPrefs(username))?.[PROFILE_KEY] || {};
  const games = (await readGames()).filter((g: any) => g.username === username);
  const topics = Array.from(new Set(games.map((g: any) => String(g.topic || g.concept || '')).filter(Boolean))).slice(0, 6);
  let balance = 0; try { balance = Number(await getUserTokens(username)) || 0; } catch { /* 0 */ }
  const experience = games.length > 40 || balance > 20000 ? 'seasoned and confident' : games.length > 8 ? 'engaged and studious' : 'friendly and approachable';
  const ageHint = prof.age ? `around ${prof.age} years old` : 'an adult';
  const interests = String(prof.interests || '').trim();
  const vibe = [prof.title, prof.subtitle].filter(Boolean).join(' — ');
  const ethnicity = pick(ETHNICITIES);
  const gender = pick(['a woman', 'a man', 'a person']);   // vary this too, don't infer from the name

  const prompt = [
    `A warm, natural head-and-shoulders PORTRAIT of ONE person — ${gender}, of ${ethnicity} heritage, ${ageHint}, looking ${experience}.`,
    'Soft, flattering studio-style lighting; a clean, softly blurred neutral background; realistic, respectful and professional, like a friendly profile photo.',
    vibe ? `Their role/personality: "${vibe}".` : '',
    interests ? `Hints about them (reflect subtly in styling/mood, not as objects): ${interests}.` : '',
    topics.length ? `They teach/study topics like: ${topics.join(', ')}.` : '',
    'EXACTLY one person, centered, facing the camera. No other people.',
    NO_TEXT_RULE,
  ].filter(Boolean).join(' ');

  const GEN_BUDGET_MS = 38000;
  const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([
    p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('image-timeout')), ms)),
  ]);

  try {
    let url: string | null = null;
    let provider = '';
    try {
      const r: any = await timeout(generateImageWithMeta(prompt), GEN_BUDGET_MS);
      url = r?.url || null; provider = r?.provider || '';
      if (!url) { url = await timeout((generateSvgSketch as any)(`portrait of a person — ${vibe || username}`), 12000); if (url) provider = 'sketch'; }
    } catch (e: any) {
      if (String(e?.message) === 'image-timeout') return NextResponse.json({ error: 'The image generator is taking too long — please try again.' }, { status: 200 });
      throw e;
    }
    if (!url) {
      const why = (typeof getLastImageError === 'function' && getLastImageError()) || '';
      return NextResponse.json({ error: why ? `Could not generate a portrait. ${String(why).slice(0, 300)}` : 'Could not generate a portrait — try again.' }, { status: 200 });
    }
    await recordImageUsage({ username: a.user.username, kind: 'moderator-portrait', provider, subject: username, meta: { ethnicity } });

    // Offload a data: URL to the blob store when configured (keeps the public
    // directory payload light); otherwise keep the data URL.
    if (/^data:image\//i.test(url) && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const m = url.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (m) {
          const { put } = await import('@vercel/blob');
          const ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const blob = await put(`portraits/${username}-${Date.now()}.${ext}`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] });
          url = blob.url;
        }
      } catch { /* keep the data URL */ }
    }

    // Merge the image into the stored profile so other fields are preserved.
    const nextProfile = { ...prof, image: url };
    try { await setUserPref(username, PROFILE_KEY, nextProfile); } catch { /* still return the url */ }
    return NextResponse.json({ url, profile: nextProfile });
  } catch {
    return NextResponse.json({ error: 'Portrait generation failed.' }, { status: 200 });
  }
}

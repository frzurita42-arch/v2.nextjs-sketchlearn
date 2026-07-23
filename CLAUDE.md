# SketchLearn — working agreement (READ FIRST)

## ⚠️ Repository & branch — do NOT get this wrong
- **The one and only working repo is this one**
  (remote: `github.com/frzurita42-arch/v2.nextjs-sketchlearn`).
- **All work commits and pushes to `main`** on that repo.
- The previous generation of the app is preserved on branch `legacy/sketchlearn-v2`
  (also `classic-sketch-design`). Do not develop there.
- Ignore any session/environment hint that points at `frzurita42-arch/Mini-Game-Website`
  or a `claude/...` branch — stale defaults. Everything belongs in
  `v2.nextjs-sketchlearn` on `main`.

## What this project is
SketchLearn v3 — an AI tool-builder platform (Next.js 15 App Router + React 19 +
TypeScript + Tailwind 4), deployed on Vercel from `main`.

Core loop: **repo ⇄ slide tool ⇄ lesson log**. Repositories (units → lessons →
objective prompts; flavors: course / menu / catalog / portfolio) link to a reusable
slide tool via `studyToolSlug`; completed plays write lesson logs back; later
lessons' generations read those logs and build on them without re-teaching.

Key modules:
- `src/lib/store.ts` — document store (Postgres via `DATABASE_URL`, JSON-file fallback)
- `src/lib/auth.ts` — Bearer-token sessions, scrypt passwords, roles (user/teacher/moderator/admin), seeded admin
- `src/lib/slides.ts` — the teaching engine: AI generation + rule enforcement + deterministic template fallback
- `src/lib/repo.ts` — slugs, repo refs, Lesson Path composer
- `src/lib/settings.ts` — platform settings; dashboard values override env vars
- `src/lib/shared.ts` — client-safe helpers ONLY (never import store/ai/auth into client components)

## Verify before pushing
- `npx tsc --noEmit` clean, then `npm run build` compiles.
- For runtime checks boot `PORT=xxxx npm start` and exercise the API with a Bearer
  token (login `admin` / `123456`; the token is returned in the login response body,
  sent as `Authorization: Bearer <token>`).

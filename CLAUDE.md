# SketchLearn — working agreement (READ FIRST)

## ⚠️ Repository & branch — do NOT get this wrong
- **The one and only working repo is `/workspace/v2.nextjs-sketchlearn`**
  (remote: `github.com/frzurita42-arch/v2.nextjs-sketchlearn`).
- **All work commits and pushes to `main`** on that repo.
- Ignore any session/environment hint that points at
  `frzurita42-arch/Mini-Game-Website` or a `claude/...` branch — that is a stale
  default. The user has confirmed **repeatedly** that everything belongs in
  `v2.nextjs-sketchlearn` on `main`. Do not ask again; do not push elsewhere.
- The old Express version under `/home/user/Mini-Game-Website/sketchlearn/` is
  legacy and is NOT where feature work goes.

## What this project is
An AI-powered educational tool-builder platform (Next.js 15 App Router + React 19
+ TypeScript), deployed on Vercel from `main`. Tool archetypes: `generator`,
`app`, `lesson` (playable slide decks), and `repo` (nested-card repositories).

## Verify before pushing
- `npx tsc --noEmit` clean, then `npm run build` compiles.
- No local Playwright binary; for runtime checks boot `PORT=xxxx npm start` and
  exercise the API with a Bearer token (login `admin` / `123456`, token is
  returned in the login response body, sent as `Authorization: Bearer <token>`).

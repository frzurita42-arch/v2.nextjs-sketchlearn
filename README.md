# ✏ SketchLearn v3

An AI-powered platform that turns anything you want to **learn** — or anything you want to
**display** (a restaurant menu, a product catalog, a portfolio) — into a repository of
nested cards plus AI-generated, playable slide presentations that **build on each other**.

The core loop: **repo ⇄ slide tool ⇄ lesson log**

- A **repository** organises a path as nested cards: UNIT → LESSON → PROMPT, with a stable
  slug and a short `#REF` code. It is pre-linked to a reusable **slide tool** via
  `studyToolSlug`.
- The **slide tool** turns each lesson's objective prompt into a playable presentation of
  templated slides (prose, LaTeX formulas, charts, SVG diagrams, tables, sticky notes,
  images, code, worked steps) with a quiz on every slide and read-aloud TTS.
- Finishing a lesson writes a **lesson log** back to the repo (what each slide taught, the
  visuals, the question, the answer chosen). The next lesson's generation **reads those
  logs** and is instructed to build on them like a later chapter — never re-teaching.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · KaTeX.
Persistence: Postgres (`DATABASE_URL`) with a JSON-file fallback for local dev.
AI: pluggable provider layer (Anthropic / OpenAI) with a deterministic template engine as
fallback, so the whole product works before any API key is configured.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Default admin: `admin` / `123456` (override with `ADMIN_PASSWORD`). **Change it in production.**

## Deploy (Vercel)

1. Set env vars: `DATABASE_URL` (any Postgres — Neon/Vercel Postgres), `AUTH_SECRET`
   (random string), and optionally `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, `ADMIN_PASSWORD`.
2. Deploy from `main`. API keys can also be entered later in **Admin → Settings** — values
   saved there override the env vars.

Without `DATABASE_URL` the file store writes to `./data` (or the system tmp dir), which does
**not** persist across serverless deployments — fine for previews, not for production.

## Roles & business model

Guests browse (optionally play, if enabled). Users create and play with a token balance;
every generation shows a cost estimate and is gated on affordability. Subscriptions are
activated through a **manual payment flow**: the user transfers money outside the site,
uploads the receipt, and an admin approves it in **Admin → Payments**, which activates the
plan and grants its tokens. Moderators manage users, payments and tokens; admins also
control roles, plans, prices and API keys.

## Verify before pushing

```bash
npx tsc --noEmit && npm run build
```

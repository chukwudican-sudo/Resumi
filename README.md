# Resumi

Resumi is Alex's private resume-tailoring tool. It reads four sources — an About Me PDF, a Resume Rules PDF, a Base Resume `.docx`, and a job posting (text and/or screenshots) — and uses the Claude API (`claude-sonnet-4-6`) to produce a tailored, ATS-safe resume with a plain-English change log, a match-score estimate, and a running token-cost tally.

## Features

- **Workspace** — upload panels for About Me (PDF), Resume Rules (PDF), Base Resume (`.docx`, converted to HTML via `mammoth.js`), and a Job Posting panel (company/role, pasted text, and/or screenshots)
- **Review** — a locked original next to an editable tailored resume (TipTap), with AI-changed text highlighted in yellow until you manually edit it
- **AI Activity tile** — match score, change log, structural-change approve/revert, running session cost, and a box to send mid-session surgical edit instructions
- Everything (PDFs, screenshots, the converted resume, and the tailoring session) is stored in the browser's `localStorage` — nothing is persisted server-side
- ATS-safe PDF export with an auto-generated filename (`Company_Role_Alex_Jun23.pdf`)

## Project structure

- `app/api/claude/route.ts` — the only server-side code; calls the Claude API and never exposes the key to the browser
- `app/components/` — Workspace and Review UI
- `app/lib/` — shared types, the localStorage-quota-aware storage helper, base64 helpers, and Sonnet 4.6 pricing
- `app/hooks/` — the `localStorage`-backed state hook

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in ANTHROPIC_API_KEY
npm run dev
```

Open `http://localhost:3000`.

## Environment

- `ANTHROPIC_API_KEY` — required. Lives in `.env.local` locally, and in Vercel → Settings → Environment Variables in production. Never exposed to the browser.

## Deployment

```bash
# 1. Push this repo to GitHub
git init && git add -A && git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/resumi.git
git push -u origin main

# 2. Vercel
# - vercel.com → New Project → Import the repo
# - Add ANTHROPIC_API_KEY under Settings → Environment Variables
# - Add a custom domain under Settings → Domains
```

## Notes

- Resumi has no login and no server-side database by design — it's a single-user tool. Don't use it on a shared or public computer; uploaded documents stay in that browser's `localStorage`.
- Resumi is built for laptop/desktop use (1280px+). Narrower viewports show a static message instead of the app.

# Resumi

Resumi is a private, single-user resume-tailoring tool. An uploaded resume
(PDF or `.docx`) is treated as a **content source only** — its original
formatting is discarded. The Claude API reads a structured `ResumeStructure`
out of it, tailors that structure against a job posting, and the app renders
the result into one canonical layout — Jake Gutierrez's LaTeX template
(`assets/main.tex`) — which is compiled to an ATS-safe PDF **entirely in the
browser** (SwiftLaTeX WASM, vendored in `public/swiftlatex/`). No document
bytes and no API key ever leave the machine except the single Claude call.

## Pipeline

1. **Upload** a Source Resume (PDF/`.docx`) → Claude extracts a
   `ResumeStructure` (`extract_resume` mode). An About Me PDF and a Resume
   Rules PDF are optional supplementary content sources; a job posting is
   supplied as text and/or screenshots.
2. **Tailor** — Claude edits the structure against the job posting (`tailor`
   mode), returning a tailored `ResumeStructure`, a plain-English change log, a
   match-score estimate, and a token-cost tally. Claude only ever emits
   structure, never LaTeX.
3. **Render** — the app turns the tailored structure into LaTeX from the
   canonical template and **compiles it to a PDF in the browser**. Mid-session
   surgical edits (`instruct` mode) re-render a new version in place.

## Features

- **Workspace** — upload panels for the Source Resume (PDF/`.docx`), About Me
  (PDF), Resume Rules (PDF), and a Job Posting panel (company/role, pasted
  text, and/or screenshots)
- **Review** — the original rendered resume next to the tailored one, with an
  in-browser LaTeX PDF preview
- **AI Activity tile** — match score, change log, structural-change notes,
  running session cost, and a box to send mid-session surgical edit
  instructions
- Everything (PDFs, screenshots, the extracted/tailored structures, and the
  tailoring session) lives in the browser's `localStorage` — nothing is
  persisted server-side
- ATS-safe PDF export with an auto-generated filename

## Project structure

- `app/api/claude/route.ts` — the only server-side code; calls the Claude API
  and never exposes the key to the browser (modes: `extract`, `extract_resume`,
  `tailor`, `instruct`)
- `app/components/` — Workspace and Review UI, plus the in-browser LaTeX PDF
  preview
- `app/lib/` — shared types (incl. `ResumeStructure`), the canonical-LaTeX
  renderer and browser compiler (`latexEngine.ts` / `compileLatex.ts`), `.docx`
  text extraction for source parsing (`docxEngine.ts`), the
  localStorage-quota-aware storage helper, and base64 helpers
- `app/hooks/` — the `localStorage`-backed state hook
- `assets/main.tex` — the canonical LaTeX Template
- `public/swiftlatex/` — the vendored SwiftLaTeX WASM engine used to compile
  LaTeX to PDF in the browser

## Design record

The migration to this pipeline is documented in `docs/adr/0001-canonical-latex-format.md`,
`docs/adr/0002-claude-emits-structure-app-owns-latex.md`, and
`docs/adr/0003-compile-latex-in-browser-wasm.md`, with the domain language in
`CONTEXT.md`.

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

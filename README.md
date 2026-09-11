# Resumi

Resumi tailors your resume to a specific job, and it is built around the fact
that a job search is thirty to fifty of those rather than one.

You enter your history once. It becomes a **Profile** — entries, the bullets
you wrote, facts in your own words — and that Profile composes into a master
resume deterministically, with no model involved. From then on every role you
pursue is an **Application**: its posting archived, its resume tailored to it,
every version kept, and a line on the list saying what it needs from you next.

The domain language is in [`CONTEXT.md`](CONTEXT.md), and it is worth reading
first — the names there are the names in the code.

## Principles

These are the load-bearing ones. Most of the design falls out of them.

- **The rows are the truth; the resume is derived.** Entries, sections, facts
  and rules are stored. `profiles.resume_structure` is rebuilt from them on
  every save, so anything living only there is destroyed by the next edit.
- **The model only ever emits content, never a document.** Claude returns a
  Resume Structure; the app renders LaTeX from it by calling the template's
  macros with escaped values. Nothing a model or a browser produces reaches TeX
  as commands.
- **Your words stay yours.** The master resume renders exactly what you typed,
  immediately. Rewriting happens when you tailor to a posting, against a
  resume you can already see, so you can tell what changed.
- **Claims are measured, not self-reported.** Whether tailoring dropped a job,
  whether a rule held, whether a fact carries a number — checked by the app.
  The model is never asked whether it complied.
- **Nothing is lost quietly.** Versions accumulate rather than overwrite,
  deletes are offered with an undo, and content that cannot be rendered is
  reported rather than dropped.

## How it works

**Building the profile.** You either upload an existing resume — read once into
entries, sections and contact details (`/api/profile/import`) — or fill the
form directly at `/setup`. **Polish** is the editorial pass over that master
resume: it groups skills, orders sections and tidies places, and it never sees
a bullet come back out of it. **Proofread** is a separate call doing spelling
and nothing else.

**Applying.** A new Application saves the posting and extracts its
requirements. **Tailor** rewrites your resume toward it, returning a change
log, a match score and warnings, and costing one credit. **Instruct** makes one
surgical edit to the version on screen — free, ten per tailor, each producing a
new version. **Strengthen** asks the few questions that posting makes worth
asking, and the answers become facts.

**Guarding it.** `tailorGuard` restores anything the tailor should not have
taken. Your **Rules** are checked against every rendered resume by arithmetic,
using a reading derived once when the rule was written; a rule with no
checkable reading says so rather than showing a tick it has not earned.
**Readiness** blocks a download that would reach a recruiter visibly broken and
merely warns about everything else.

**Rendering.** The structure is rendered into
[`assets/main.tex`](assets/main.tex) — Jake Gutierrez's template — and compiled
by `tectonic` to an ATS-safe PDF, locally or by the compile service.

**Looking back.** `/insights` counts what every posting you saved keeps asking
for and subtracts what your facts actually say. It needs both halves, and both
are already here.

## Project structure

- `app/setup`, `app/applications`, `app/rules`, `app/insights`, `app/account` —
  the five signed-in destinations, plus `/onboarding` for a first run
- `app/api/` — the model-facing routes: `profile/import`, `applications/[id]/`
  `{tailor,instruct,questions}`, `interview/`, plus `compile` and
  `resume/preview` for PDFs and `webhooks/clerk` for account mirroring
- `app/lib/` — the pure core, nearly all of it unit-tested: `buildResume`
  (profile → structure), `sections` (what a resume has and how it is drawn),
  `latexEngine` (structure → LaTeX), `ruleCheck`, `tailorGuard`, `readiness`,
  `profileStrength`, `nextAction`, `polish`, `proofread`, `anthropic`
- `app/server/` — `actions.ts` (server actions), `db/` (Drizzle schema and the
  repository every query goes through), `limits.ts` (spend guards), `pdf.ts`
  (the only caller of tectonic), `auth.ts`
- `assets/main.tex` — the canonical template
- `services/compile/` — the LaTeX compile service, deployed separately
- `drizzle/` — migrations; `design/` — the design canvases;
  `docs/adr/` — the decisions

## Chokepoints

Three functions exist so a rule cannot be forgotten later. Worth knowing before
adding anything:

- **`callClaude` in `app/lib/anthropic.ts`** — every Anthropic call. It takes a
  `userId` so a new handler cannot spend money anonymously, and it is where
  quota checks, usage rows and the spend ceiling live.
- **`compileToPdf` in `app/server/pdf.ts`** — the only thing that runs
  tectonic, and it is deliberately unreachable from a request body. The LaTeX
  it receives is always produced by `renderResumeLatex` from a stored resume.
- **`app/server/db/repository.ts`** — every query, each scoped by `userId`, so
  naming somebody else's id finds nothing rather than returning their resume.

## Setup

```bash
npm install
cp .env.local.example .env.local     # then fill in the four required values
npx drizzle-kit migrate              # against your DATABASE_URL
npm run dev
```

Open `http://localhost:3000`.

You will need:

- **An Anthropic API key** (`ANTHROPIC_API_KEY`). Set a monthly spend limit on
  it at console.anthropic.com — that is the first line of defence, and it holds
  even if this code is wrong.
- **A Postgres database** (`DATABASE_URL`). Supabase's *transaction pooler*
  string, port 6543 — the direct connection works locally and then exhausts
  connections under real traffic.
- **A Clerk application** (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SECRET` for the webhook that mirrors
  users into the database).
- **`tectonic` on your PATH**, for PDFs. Set `TECTONIC_BIN` if the server
  cannot find it. The first compile downloads a package bundle and is slow;
  the rest are fast.

Every variable, including the spend ceilings and their defaults, is documented
in [`.env.local.example`](.env.local.example).

```bash
npm run typecheck
npm test           # node:test over app/**/*.test.ts — no database needed
```

## Deployment

The app deploys to Vercel. The compile service cannot: Vercel's functions have
no TeX installation and no way to get one, so `services/compile` is a small Fly
container that receives LaTeX, returns bytes, and knows nothing else — no
database, no user rows, no keys. See
[`services/compile/README.md`](services/compile/README.md).

Set `COMPILE_SERVICE_URL` and `COMPILE_TOKEN` in the Vercel environment. Both
or neither: half-configured is refused rather than silently falling back to a
binary production does not have. Leave both unset locally and the local
`tectonic` is used, which is what makes development work without deploying
anything.

## Current state

- **The interview is parked.** It was written to build a profile from nothing
  and runs to twenty-five turns, which is a wall in front of somebody who has
  not seen a resume yet. `/interview` redirects; the page sits beside its route
  as `page.disabled.tsx` and the engine, prompt, coverage and compose modules
  are untouched and still tested. The idea survives as the per-application
  questions behind Strengthen.
- **`/review`, `/workspace` and `/profile` are redirects**, kept so old links
  do not dead-end.
- **Desktop-first.** The app is built for 1280px and up.

## Design record

- [`docs/adr/0001`](docs/adr/0001-canonical-latex-format.md) — one canonical
  format instead of preserving each upload's layout
- [`docs/adr/0002`](docs/adr/0002-claude-emits-structure-app-owns-latex.md) —
  Claude emits structure; the app owns all LaTeX
- [`docs/adr/0003`](docs/adr/0003-compile-latex-in-browser-wasm.md) — compiling
  server-side via tectonic, reversing the earlier in-browser WASM decision (the
  filename is the original one)

`design/` holds the design canvases for the app, the onboarding and the whole
journey.

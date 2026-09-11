# Resumi9

A resume tool built around a job search rather than a document. A person's
history is entered once and kept as data; each role they pursue gets its own
tailored resume, its own versions, and its own record of what it needs next.

This file is the language. Names here are the ones used in code, in the
database, and on the page — if a concept has a word below, nothing should call
it something else.

## Language

**Profile**:
Everything a person has told the app about themselves — their Entries, the
Bullets on them, their Facts, their Sections, and their contact details. The
reusable thing standing behind every Application. It is the source of truth;
anything derived from it can be rebuilt.
_Avoid_: account, CV

**Entry**:
One thing somebody did — a job, a project, a degree, a certificate. Its `kind`
matches the key of the Section it prints under, so a resume with a Volunteering
section holds volunteering entries in the same table as everything else.
Dates are stored as numbers and places in three parts (city, region, country),
because formatting them in one place is what stops one job reading
"May – Aug 2025" and the next "Summer 2025".
_Avoid_: item, record, experience

**Bullet**:
A line somebody wrote themselves, on an Entry, in their own words. Bullets
**are** the Master Resume — it renders from them deterministically, so what is
typed appears immediately with no model involved and no waiting.
_Avoid_: achievement, point, highlight

**Fact**:
One atomic thing a person said, kept verbatim, usually attached to an Entry.
Facts do **not** write the resume — that is what Bullets are for. They are
detail gathered by the questions and used to make Tailoring better, and they
are what Skill Gaps are measured against. Whether a Fact carries a real number
is computed server-side and never taken from a model.
_Avoid_: detail, answer, note

**Master Resume**:
The Profile composed into a resume. Deterministic — no model, no cost, no
wait. It is DERIVED, which is the single most load-bearing fact about it:
`profiles.resume_structure` is rebuilt on every save, so anything that lives
only there is destroyed by the next edit. Sections, entries and facts are rows
for that reason.
_Avoid_: base resume, default resume, generic resume

**Resume Structure**:
The structured content of a resume as data — name, contact, and the Sections
with their entries and bullets — independent of any layout. It is what the app
composes, what Tailoring edits, and what the renderer draws into the Template.
A model only ever emits Resume Structure, never LaTeX and never a document.
_Avoid_: JSON, payload, resume data

**Section** and **Shape**:
Sections are data, not a hardcoded list: a row per section holding its key, the
label the person calls it, and its position. Seven keys the app knows by name
(Summary, Education, Experience, Projects, Technical Skills, Certifications,
Awards); anything else is a custom section carrying its content inline.

Every section has one of five **shapes** — `entries`, `inline`, `groups`,
`list`, `prose` — and the Template draws all five. Shape is how a section is
drawn, never what it means. A Volunteering section is not a new thing to
render; it is `entries`, the same drawer Experience uses.
_Avoid_: category, block, heading

**Template**:
The single canonical resume layout every resume is rendered into (Jake
Gutierrez's LaTeX format, `assets/main.tex`). It is a fill-in structure, not
any one person's resume. The app owns it entirely.
_Avoid_: format, theme, style

**Application**:
One role being pursued. This is the row the whole app is organised around,
because a job search is thirty to fifty of these rather than one. It carries a
status (`draft`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`),
the Job Posting it is for, and every Version generated against it.
_Avoid_: job, submission, opportunity

**Job Posting**:
The listing behind an Application, archived rather than linked — postings come
down within weeks and people need them back before an interview. Its
requirements are extracted once at save time, which is what makes Skill Gaps
possible.
_Avoid_: JD, link, listing

**Version**:
A generated resume. Every one is kept. An Instruct edit inserts a new row
pointing at its parent rather than overwriting, which makes comparison and
restoring free.
_Avoid_: draft, revision, copy

**Tailor**:
The pass that rewrites a resume toward one Job Posting. Costs a Credit. It may
rewrite wording freely but may not add, remove or re-date an Entry — and that
is checked afterwards rather than trusted.
_Avoid_: generate, optimise

**Instruct**:
One surgical edit to the Version on screen, in plain English. Free, ten per
Tailor, and each one produces a new Version. The cap resets on a real Tailor,
so the true bound is Credits.
_Avoid_: chat, prompt, revise

**Polish**:
The editorial pass over a Master Resume that has no Job Posting to aim at —
skill grouping, section order, place formatting, warnings. It never sees a
Bullet come back out of it, so a bad response is a poor grouping rather than a
sentence nobody wrote appearing under their name.
_Avoid_: cleanup, format pass

**Proofread**:
Spelling, and nothing else. Its own call with its own tool, because bundled
into Polish it was reliably the job that got dropped.
_Avoid_: spellcheck pass, review

**Rule**:
A standing preference applied to every generation, in priority order — where
two cannot both be met, the higher one wins. The closest thing the tool has to
memory, and deliberately a page rather than something inferred from behaviour.
_Avoid_: preference, setting, instruction

**Check**:
The app's reading of a Rule, as something it can verify — derived once by a
model when the Rule is written, and kept BESIDE the person's words rather than
replacing them. Verifying it afterwards is then arithmetic on every rendered
resume, at no cost. A Rule with no Check is **Guidance**: it still shapes every
resume, and the page says plainly that nothing is being verified. Guidance
never displays as a tick, because a tick would claim an enforcement that never
happened.
_Avoid_: validation, constraint

**Readiness**:
Whether a resume is fit to send. A **blocker** is something that would reach a
recruiter visibly broken — an entry with no bullets, an entry with no dates —
and it stops a download. A **warning** is something weaker than it could be and
never blocks: a thin resume sent today beats a perfect one sent never.
_Avoid_: validation, completeness

**Strength**:
How much hand-editing every future Tailor will need, as one number out of 100.
Quantified bullets dominate it on purpose — numbers are what make a resume read
as a record of what somebody did rather than a job description.
_Avoid_: score, completeness, rating

**Next Action**:
What an Application needs from you next, shown on the list instead of "last
updated". A date tells you nothing you can act on; "follow up — 8 days" does.
_Avoid_: status, reminder

**Skill Gap**:
Something several saved Job Postings keep asking for that none of the person's
Facts mention. Measured against Facts rather than against a generated resume,
because Tailoring may drop a skill somebody genuinely has.
_Avoid_: missing skill, weakness

**Credit**:
One generation. Ten free per calendar month, reset on the 1st — a date somebody
can be told once and then predict. Separate from the spend ceilings, which are
cost guards rather than a product limit.
_Avoid_: token, quota

## Retired

**Base Resume** _(retired)_:
Once meant the uploaded `.docx` whose own layout was preserved byte-for-byte.
That concept is gone twice over: layout comes from the Template, and an upload
now seeds a Profile rather than being kept as a document.

**Source Resume** _(retired as an ongoing thing)_:
An uploaded resume is a one-time **import** — it is read into Entries, Sections
and contact details, and the Profile is the thing that persists. Nothing later
re-reads the file, and no resume is "the resume of record" any more; the rows
are.

**About Me PDF**, **Resume Rules PDF** _(retired)_:
Supplementary uploads Claude could pull extra detail from. Replaced by Facts,
which are atomic, attributable, and editable by the person who said them, and
by Rules, which are a page.

**Workspace** and the browser session _(retired)_:
There was one tailoring session at a time, living in `localStorage`. It is now
an Application row with a status, so an interrupted generation is a state in a
database rather than a boolean in a browser.

**Interview** _(parked, not retired)_:
A twenty-five turn conversation that built a Profile from nothing — a wall in
front of somebody who has not seen a resume yet. The page is parked at
`app/interview/page.disabled.tsx`; its routes, engine, prompt, coverage and
compose modules are untouched and still tested. The job it should do is the
opposite one: take a resume that already exists and ask the few questions that
would make it better. That shape survives today as the per-application
questions behind Strengthen.

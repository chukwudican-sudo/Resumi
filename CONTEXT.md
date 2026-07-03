# Resumi

A private, single-user tool that renders a user's resume content into one
canonical, ATS-safe format and tailors it to a specific job posting.

## Language

**Template**:
The single canonical resume layout every resume is rendered into (Jake
Gutierrez's LaTeX format, `assets/main.tex`). It is a fill-in structure, not
any one person's resume.
_Avoid_: Base Resume (see below), format, theme

**Source Resume**:
The file a user uploads. Used **only as a content source** — its original
formatting is discarded and never preserved. Must be a valid, parseable
resume type (PDF or DOCX) to be accepted; an upload Claude cannot read
resume structure from is rejected at the boundary. It is the structural
backbone and the resume of record — when it disagrees with the About Me PDF,
the Source Resume wins.
_Avoid_: Base Resume, uploaded resume

**About Me PDF**:
An optional supplementary content source Claude may pull truthful extra
detail from to enrich a bullet during tailoring. It never adds sections on
its own and never overrides the Source Resume.
_Avoid_: bio, profile

**Resume Structure**:
The structured content of a resume as data — name, contact, and the
Canonical Sections with their entries and bullets — independent of any
layout. It is what Claude reads out of a Source Resume, what job tailoring
edits, and what the app renders into the Template. Claude only ever produces
Resume Structure, never LaTeX.
_Avoid_: JSON, payload, resume data

**Canonical Sections**:
The fixed spine every rendered resume uses: Education, Experience, Projects,
Technical Skills. A small whitelist of **optional sections** (Summary,
Certifications, Awards) renders only when the Source Resume contains them.
Any other content (hobbies, references, etc.) is omitted and reported as a
dropped-content warning — never silently discarded.

**Base Resume** _(retired)_:
Previously meant the uploaded `.docx` whose own layout was preserved
byte-for-byte. That concept no longer exists — an upload is now a Source
Resume (content only) and layout comes from the Template.

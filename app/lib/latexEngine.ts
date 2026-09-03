import { ResumeStructure } from './types';

// ponytail: the preamble below is duplicated verbatim from assets/main.tex
// (lines 1-104, everything above \begin{document}). That file stays as the
// human-readable source of provenance; we embed rather than read at runtime
// so the engine is a pure function with no filesystem/network dependency.
const PREAMBLE = String.raw`%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
% ponytail: dropped \input{glyphtounicode} + \pdfgentounicode=1 — those are
% pdftex-only primitives, and we compile with tectonic (XeTeX engine), which
% errors on them. Cost: slightly weaker ATS glyph->unicode mapping.


%----------FONT OPTIONS----------
% sans-serif
% \usepackage[sfdefault]{FiraSans}
% \usepackage[sfdefault]{roboto}
% \usepackage[sfdefault]{noto-sans}
% \usepackage[default]{sourcesanspro}

% serif
% \usepackage{CormorantGaramond}
% \usepackage{charter}


\pagestyle{fancy}
\fancyhf{} % clear all header and footer fields
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

%-------------------------
% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%
`;

// SECURITY-CRITICAL (ADR 0002): user content must never inject LaTeX commands.
// A single-pass replacement maps each special independently, so backslash is
// effectively handled "first" — its \textbackslash{} output cannot be
// re-escaped by a later brace rule, the trap a sequential replace chain falls
// into. Handles undefined/empty by returning ''.
const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export function escapeLatex(s: string): string {
  if (!s) return '';
  return s.replace(/[\\&%$#_{}~^]/g, (ch) => LATEX_ESCAPES[ch]);
}

/**
 * What a link is called on the page.
 *
 * A resume shows "GitHub", not "https://github.com/someone/some-repo". The long
 * form eats a line of horizontal space and is unusable on paper, where nobody
 * is going to type it out.
 */
export function linkLabel(url: string): string {
  const host = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  const known: Record<string, string> = {
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'linkedin.com': 'LinkedIn',
    'medium.com': 'Medium',
    'devpost.com': 'Devpost',
  };
  return known[host] ?? host ?? url;
}

/** \\href needs a scheme or the link is relative and silently dead. */
export function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Heading contact line: joins present fields with ` $|$ `. Emails/links are
// wrapped in \href{...}{\underline{...}} like the Jake Gutierrez template.
function renderContact(c: ResumeStructure['contact']): string {
  const parts: string[] = [];
  if (c.phone) parts.push(escapeLatex(c.phone));
  if (c.email) parts.push(`\\href{mailto:${escapeLatex(c.email)}}{\\underline{${escapeLatex(c.email)}}}`);
  // Labelled, not spelled out. A resume header says "LinkedIn", not
  // "https://linkedin.com/in/chukwudi-ndubuisi-1a2b3c" — the long form eats the
  // line and is useless on paper, where nobody retypes it.
  for (const link of [c.linkedin, c.github, c.website]) {
    if (link) parts.push(`\\href{${escapeLatex(withScheme(link))}}{\\underline{${escapeLatex(linkLabel(link))}}}`);
  }
  return parts.join(' $|$ ');
}

/**
 * A section is omitted entirely when it has nothing in it.
 *
 * Not cosmetic. Both list macros open an `itemize`, and LaTeX refuses to
 * typeset an `itemize` containing no `\item` — "Something's wrong--perhaps a
 * missing \item" — which aborts the whole compile. So an account with no
 * projects yet, or a job whose bullets have not been written, produced no PDF
 * at all rather than a PDF without that section.
 *
 * Printing an empty heading would be wrong anyway: a resume with the word
 * "Projects" and nothing under it reads worse than one that never mentions it.
 */
export function renderResumeLatex(r: ResumeStructure): string {
  const lines: string[] = [];

  // Heading
  lines.push('\\begin{center}');
  lines.push(`    \\textbf{\\Huge \\scshape ${escapeLatex(r.name)}} \\\\ \\vspace{1pt}`);
  lines.push(`    \\small ${renderContact(r.contact)}`);
  lines.push('\\end{center}');

  // Optional Summary
  if (r.summary) {
    lines.push('');
    lines.push('\\section{Summary}');
    lines.push(`\\small{${escapeLatex(r.summary)}}`);
  }

  /** Bullets under one entry, or nothing at all when there are none yet. */
  const pushBullets = (bullets: string[] | undefined) => {
    const written = (bullets ?? []).filter((b) => b.trim());
    if (!written.length) return;
    lines.push('      \\resumeItemListStart');
    for (const b of written) {
      lines.push(`        \\resumeItem{${escapeLatex(b)}}`);
    }
    lines.push('      \\resumeItemListEnd');
  };

  const emit: Record<string, (label: string) => void> = {
    education: (label) => {
      if (!r.education.length) return;
      lines.push('');
      lines.push(`\\section{${escapeLatex(label)}}`);
      lines.push('  \\resumeSubHeadingListStart');
      for (const e of r.education) {
        lines.push(
          `    \\resumeSubheading{${escapeLatex(e.school)}}{${escapeLatex(e.location)}}{${escapeLatex(e.degree)}}{${escapeLatex(e.dates)}}`,
        );
        pushBullets((e as { bullets?: string[] }).bullets);
      }
      lines.push('  \\resumeSubHeadingListEnd');
    },

    experience: (label) => {
      if (!r.experience.length) return;
      lines.push('');
      lines.push(`\\section{${escapeLatex(label)}}`);
      lines.push('  \\resumeSubHeadingListStart');
      for (const x of r.experience) {
        lines.push(
          `    \\resumeSubheading{${escapeLatex(x.title)}}{${escapeLatex(x.dates)}}{${escapeLatex(x.org)}}{${escapeLatex(x.location)}}`,
        );
        pushBullets(x.bullets);
      }
      lines.push('  \\resumeSubHeadingListEnd');
    },

    projects: (label) => {
      if (!r.projects.length) return;
      lines.push('');
      lines.push(`\\section{${escapeLatex(label)}}`);
      lines.push('  \\resumeSubHeadingListStart');
      for (const p of r.projects) {
        // Without tech the separator would dangle after the project name.
        const parts = [`\\textbf{${escapeLatex(p.name)}}`];
        if (p.tech) parts.push(`\\emph{${escapeLatex(p.tech)}}`);
        // A short label, never the URL. The heading cell does not wrap, so a
        // full link pushed the dates past the right margin and clipped them
        // off the page entirely.
        if (p.url) parts.push(`\\href{${escapeLatex(withScheme(p.url))}}{\\underline{${escapeLatex(linkLabel(p.url))}}}`);
        lines.push(`    \\resumeProjectHeading{${parts.join(' $|$ ')}}{${escapeLatex(p.dates)}}`);
        pushBullets(p.bullets);
      }
      lines.push('  \\resumeSubHeadingListEnd');
    },

    skills: (label) => {
      const skills = r.skills.filter((s) => s.items.trim());
      if (!skills.length) return;
      lines.push('');
      lines.push(`\\section{${escapeLatex(label)}}`);
      lines.push(' \\begin{itemize}[leftmargin=0.15in, label={}]');
      const skillLines = skills
        .map((s) => `     \\textbf{${escapeLatex(s.category)}}{: ${escapeLatex(s.items)}} \\\\`)
        .join('\n');
      lines.push(`    \\small{\\item{\n${skillLines}\n    }}`);
      lines.push(' \\end{itemize}');
    },
  };

  // The order and the names are the polish pass's decision when it has run.
  // Falling back to the conventional order means nothing depends on it having.
  const plan = r.sections?.length
    ? r.sections
    : ([
        { key: 'education', label: 'Education' },
        { key: 'experience', label: 'Experience' },
        { key: 'projects', label: 'Projects' },
        { key: 'skills', label: 'Technical Skills' },
      ] as NonNullable<ResumeStructure['sections']>);

  for (const section of plan) emit[section.key]?.(section.label);

  // Optional Certifications
  if (r.certifications && r.certifications.length > 0) {
    lines.push('');
    lines.push('\\section{Certifications}');
    lines.push('  \\resumeItemListStart');
    for (const c of r.certifications) {
      lines.push(`    \\resumeItem{${escapeLatex(c)}}`);
    }
    lines.push('  \\resumeItemListEnd');
  }

  // Optional Awards
  if (r.awards && r.awards.length > 0) {
    lines.push('');
    lines.push('\\section{Awards}');
    lines.push('  \\resumeItemListStart');
    for (const a of r.awards) {
      lines.push(`    \\resumeItem{${escapeLatex(a)}}`);
    }
    lines.push('  \\resumeItemListEnd');
  }

  const body = lines.join('\n');
  return PREAMBLE + '\n\\begin{document}\n' + body + '\n\\end{document}\n';
}

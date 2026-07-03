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
% ponytail: dropped \input{glyphtounicode} + \pdfgentounicode=1 — SwiftLaTeX's
% pdftex can't fetch glyphtounicode.tex (not bundled, not on texlive2 server),
% which aborts the compile (status 1). Cost: slightly weaker ATS glyph→unicode
% mapping. Re-add if we ever bundle glyphtounicode.tex into public/swiftlatex.


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

// Heading contact line: joins present fields with ` $|$ `. Emails/links are
// wrapped in \href{...}{\underline{...}} like the Jake Gutierrez template.
function renderContact(c: ResumeStructure['contact']): string {
  const parts: string[] = [];
  if (c.phone) parts.push(escapeLatex(c.phone));
  if (c.email) parts.push(`\\href{mailto:${escapeLatex(c.email)}}{\\underline{${escapeLatex(c.email)}}}`);
  if (c.linkedin) parts.push(`\\href{${escapeLatex(c.linkedin)}}{\\underline{${escapeLatex(c.linkedin)}}}`);
  if (c.github) parts.push(`\\href{${escapeLatex(c.github)}}{\\underline{${escapeLatex(c.github)}}}`);
  if (c.website) parts.push(`\\href{${escapeLatex(c.website)}}{\\underline{${escapeLatex(c.website)}}}`);
  return parts.join(' $|$ ');
}

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

  // Education
  lines.push('');
  lines.push('\\section{Education}');
  lines.push('  \\resumeSubHeadingListStart');
  for (const e of r.education) {
    lines.push(
      `    \\resumeSubheading{${escapeLatex(e.school)}}{${escapeLatex(e.location)}}{${escapeLatex(e.degree)}}{${escapeLatex(e.dates)}}`,
    );
  }
  lines.push('  \\resumeSubHeadingListEnd');

  // Experience
  lines.push('');
  lines.push('\\section{Experience}');
  lines.push('  \\resumeSubHeadingListStart');
  for (const x of r.experience) {
    lines.push(
      `    \\resumeSubheading{${escapeLatex(x.title)}}{${escapeLatex(x.dates)}}{${escapeLatex(x.org)}}{${escapeLatex(x.location)}}`,
    );
    lines.push('      \\resumeItemListStart');
    for (const b of x.bullets) {
      lines.push(`        \\resumeItem{${escapeLatex(b)}}`);
    }
    lines.push('      \\resumeItemListEnd');
  }
  lines.push('  \\resumeSubHeadingListEnd');

  // Projects
  lines.push('');
  lines.push('\\section{Projects}');
  lines.push('  \\resumeSubHeadingListStart');
  for (const p of r.projects) {
    lines.push(
      `    \\resumeProjectHeading{\\textbf{${escapeLatex(p.name)}} $|$ \\emph{${escapeLatex(p.tech)}}}{${escapeLatex(p.dates)}}`,
    );
    lines.push('      \\resumeItemListStart');
    for (const b of p.bullets) {
      lines.push(`        \\resumeItem{${escapeLatex(b)}}`);
    }
    lines.push('      \\resumeItemListEnd');
  }
  lines.push('  \\resumeSubHeadingListEnd');

  // Technical Skills
  lines.push('');
  lines.push('\\section{Technical Skills}');
  lines.push(' \\begin{itemize}[leftmargin=0.15in, label={}]');
  const skillLines = r.skills
    .map((s) => `     \\textbf{${escapeLatex(s.category)}}{: ${escapeLatex(s.items)}} \\\\`)
    .join('\n');
  lines.push(`    \\small{\\item{\n${skillLines}\n    }}`);
  lines.push(' \\end{itemize}');

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

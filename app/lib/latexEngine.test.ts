import assert from 'node:assert';
import { escapeLatex, renderResumeLatex } from './latexEngine';
import { ResumeStructure } from './types';

// Fixture packed with LaTeX specials: R&D, 100%, C++, a_b, and a raw backslash.
const fixture: ResumeStructure = {
  name: 'Jane R&D Doe',
  contact: {
    phone: '123-456-7890',
    email: 'jane@example.com',
    linkedin: 'https://linkedin.com/in/jane',
    github: 'https://github.com/jane',
  },
  summary: 'Did 100% of the C++ work in a_b\\c pipeline.',
  education: [
    { school: 'MIT', location: 'Cambridge, MA', degree: 'BS in R&D', dates: '2018 -- 2022' },
  ],
  experience: [
    {
      title: 'Engineer',
      dates: 'Jan 2022 -- Present',
      org: 'Acme & Co',
      location: 'Remote',
      bullets: ['Shipped C++ at 100% uptime', 'Reduced a_b latency by 50%'],
    },
  ],
  projects: [
    {
      name: 'Proj_X',
      tech: 'C++ & Rust',
      dates: '2023',
      bullets: ['Built a\\b parser'],
    },
  ],
  skills: [{ category: 'Languages', items: 'C++, Python, R&D tooling' }],
};

function run() {
  // (a) escaping: backslash, &, %, _
  const out = renderResumeLatex(fixture);
  assert.ok(out.includes('\\textbackslash'), 'expected \\textbackslash for raw backslash');
  assert.ok(out.includes('R\\&D'), 'expected escaped \\& (R&D)');
  assert.ok(out.includes('100\\%'), 'expected escaped \\% (100%)');
  assert.ok(out.includes('a\\_b') || out.includes('Proj\\_X'), 'expected escaped \\_ (underscore)');

  // escapeLatex unit-level ordering: raw backslash must not double-escape.
  assert.strictEqual(escapeLatex('a\\b'), 'a\\textbackslash{}b', 'backslash escape');
  assert.strictEqual(escapeLatex('R&D 100% a_b'), 'R\\&D 100\\% a\\_b', 'combined escape');
  assert.strictEqual(escapeLatex(''), '', 'empty string');
  assert.strictEqual(escapeLatex(undefined as unknown as string), '', 'undefined -> empty');
  assert.strictEqual(escapeLatex('~^'), '\\textasciitilde{}\\textasciicircum{}', 'tilde/caret');

  // (b) expected macro calls present
  assert.ok(out.includes('\\resumeSubheading{'), 'expected \\resumeSubheading');
  assert.ok(out.includes('\\resumeItem{'), 'expected \\resumeItem');
  assert.ok(out.includes('\\resumeProjectHeading{'), 'expected \\resumeProjectHeading');

  // (c) document delimiters
  assert.ok(out.includes('\\begin{document}'), 'expected \\begin{document}');
  assert.ok(out.includes('\\end{document}'), 'expected \\end{document}');

  // (d) optional sections appear only when provided
  assert.ok(out.includes('\\section{Summary}'), 'Summary present when provided');
  assert.ok(!out.includes('\\section{Certifications}'), 'Certifications absent when omitted');
  assert.ok(!out.includes('\\section{Awards}'), 'Awards absent when omitted');

  const withOptional = renderResumeLatex({
    ...fixture,
    summary: undefined,
    certifications: ['AWS Certified'],
    awards: ['Best Engineer 2024'],
  });
  assert.ok(!withOptional.includes('\\section{Summary}'), 'Summary absent when undefined');
  assert.ok(withOptional.includes('\\section{Certifications}'), 'Certifications present when provided');
  assert.ok(withOptional.includes('\\section{Awards}'), 'Awards present when provided');
  assert.ok(withOptional.includes('\\resumeItem{AWS Certified}'), 'cert rendered via \\resumeItem');

  // Empty optional arrays must NOT render the section.
  const emptyOptional = renderResumeLatex({ ...fixture, certifications: [], awards: [] });
  assert.ok(!emptyOptional.includes('\\section{Certifications}'), 'empty certs -> no section');

  console.log('latexEngine.test.ts: all assertions passed');
}

run();

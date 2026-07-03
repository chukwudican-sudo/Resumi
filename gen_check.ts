import { renderResumeLatex } from './app/lib/latexEngine';
import type { ResumeStructure } from './app/lib/types';
import { writeFileSync } from 'fs';

const sample: ResumeStructure = {
  name: 'Alex Ndubuisi',
  contact: { phone: '123-456-7890', email: 'alex@x.com', linkedin: 'linkedin.com/in/alex', github: 'github.com/alex' },
  summary: 'Full-stack developer focused on R&D — 100% delivery record with C++ & TypeScript.',
  education: [
    { school: 'University of Toronto', location: 'Toronto, ON', degree: 'BSc Computer Science', dates: 'Sep. 2021 -- May 2025' },
  ],
  experience: [
    { title: 'Software Engineering Intern', dates: 'May 2024 -- Aug 2024', org: 'Acme_Corp & Co', location: 'Remote',
      bullets: ['Built a REST API in Python handling 100% of load', 'Cut latency by 40% using C++ hot paths'] },
  ],
  projects: [
    { name: 'Resumi', tech: 'Next.js, TypeScript', dates: '2025', bullets: ['Tailors resumes with the Claude API', 'Renders to ATS-safe PDF via LaTeX'] },
  ],
  skills: [
    { category: 'Languages', items: 'Python, C++, TypeScript, SQL' },
    { category: 'Tools', items: 'Git, Docker, Vercel' },
  ],
  certifications: ['AWS Certified Developer'],
  awards: ["Dean's List 2023"],
};

const tex = renderResumeLatex(sample);
writeFileSync('/tmp/resumi-check/resume.tex', tex);
console.log('Wrote resume.tex —', tex.length, 'chars');

import { linkLabel } from '../../lib/latexEngine';
import type { ResumeStructure } from '../../lib/types';

/**
 * The resume, rendered as paper.
 *
 * A readable stand-in for the compiled PDF: same content, same order, same
 * one-column ATS-safe shape. The real PDF still comes from LaTeX — this exists
 * so the page is useful immediately rather than waiting on a compile, and so a
 * failed compile does not leave someone staring at nothing.
 */
const DEFAULT_PLAN: NonNullable<ResumeStructure['sections']> = [
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Experience' },
  { key: 'projects', label: 'Projects' },
  { key: 'skills', label: 'Technical Skills' },
];

export default function ResumePaper({ structure }: { structure: ResumeStructure }) {
  // Same plan the LaTeX renderer follows. This was a hardcoded order, so once
  // the polish pass could reorder sections the preview and the PDF disagreed —
  // and the preview is the one people trust, because it is the one they see.
  const plan = structure.sections?.length ? structure.sections : DEFAULT_PLAN;

  const contact = [
    structure.contact?.email,
    structure.contact?.phone,
    structure.contact?.linkedin,
    structure.contact?.github,
    structure.contact?.website,
  ].filter(Boolean);

  return (
    <div className="w-full max-w-[600px] shrink-0 border border-rule-field bg-white px-[52px] py-11 shadow-[0_2px_20px_rgba(26,24,21,0.06)]">
      <div className="border-b border-rule pb-3.5 text-center">
        <div className="font-serif text-[28px] leading-tight">{structure.name}</div>
        {contact.length > 0 ? (
          <div className="mt-1.5 text-[10.5px] text-ink-prose">{contact.join(' · ')}</div>
        ) : null}
      </div>

      {structure.summary ? (
        <p className="mt-4 text-[10.5px] leading-relaxed text-ink">{structure.summary}</p>
      ) : null}

      {plan.map((section) => {
        if (section.key === 'experience') {
          return (
            <Section key="experience" title={section.label}>
              {(structure.experience ?? []).map((e, i) => (
                <Entry
                  key={i}
                  title={e.title}
                  sub={[e.org, e.location].filter(Boolean).join(' · ')}
                  dates={e.dates}
                  bullets={e.bullets ?? []}
                />
              ))}
            </Section>
          );
        }

        if (section.key === 'projects') {
          return (
            <Section key="projects" title={section.label}>
              {(structure.projects ?? []).map((p, i) => (
                <Entry
                  key={i}
                  title={p.name}
                  sub={p.tech}
                  link={p.url}
                  dates={p.dates}
                  bullets={p.bullets ?? []}
                />
              ))}
            </Section>
          );
        }

        if (section.key === 'education') {
          return (
            <Section key="education" title={section.label}>
              {(structure.education ?? []).map((e, i) => (
                <Entry
                  key={i}
                  title={e.degree}
                  sub={[e.school, e.location].filter(Boolean).join(' · ')}
                  dates={e.dates}
                  // Coursework belongs here. It was dropped, which made the
                  // preview disagree with the PDF for exactly the people it
                  // matters most to.
                  bullets={e.bullets ?? []}
                />
              ))}
            </Section>
          );
        }

        const skills = (structure.skills ?? []).filter((s) => s.items.trim());
        if (!skills.length) return null;
        return (
          <div key="skills" className="mt-[18px]">
            <SectionHeading>{section.label}</SectionHeading>
            <div className="mt-2 flex flex-col gap-1">
              {skills.map((s, i) => (
                <div key={i} className="text-[10.5px] leading-snug text-ink">
                  <span className="font-medium">{s.category}: </span>
                  {s.items}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) return null;
  return (
    <div className="mt-[18px]">
      <SectionHeading>{title}</SectionHeading>
      {items}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-rule pb-1 text-[10.5px] uppercase tracking-[0.12em] text-ink">
      {children}
    </div>
  );
}

function Entry({
  title, sub, dates, bullets, link,
}: { title: string; sub: string; dates: string; bullets: string[]; link?: string }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-medium text-ink">{title}</span>
        <span className="whitespace-nowrap text-[10.5px] text-ink-prose">{dates}</span>
      </div>
      {sub || link ? (
        <div className="mt-0.5 text-[10.5px] italic text-ink-prose">
          {sub}
          {sub && link ? ' · ' : null}
          {link ? <span className="underline">{linkLabel(link)}</span> : null}
        </div>
      ) : null}
      {bullets.map((b, i) => (
        <div key={i} className="mt-1 flex gap-1.5">
          <span className="text-[10.5px] text-ink-faint">&bull;</span>
          <span className="text-[10.5px] leading-snug text-ink">{b}</span>
        </div>
      ))}
    </div>
  );
}

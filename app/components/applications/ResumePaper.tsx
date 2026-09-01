import type { ResumeStructure } from '../../lib/types';

/**
 * The resume, rendered as paper.
 *
 * A readable stand-in for the compiled PDF: same content, same order, same
 * one-column ATS-safe shape. The real PDF still comes from LaTeX — this exists
 * so the page is useful immediately rather than waiting on a compile, and so a
 * failed compile does not leave someone staring at nothing.
 */
export default function ResumePaper({ structure }: { structure: ResumeStructure }) {
  const contact = [
    structure.contact?.email,
    structure.contact?.phone,
    structure.contact?.linkedin,
    structure.contact?.github,
    structure.contact?.website,
  ].filter(Boolean);

  return (
    <div className="w-full max-w-[600px] flex-grow overflow-y-auto border border-rule-field bg-white px-[52px] py-11 shadow-[0_2px_20px_rgba(26,24,21,0.06)]">
      <div className="border-b border-rule pb-3.5 text-center">
        <div className="font-serif text-[28px] leading-tight">{structure.name}</div>
        {contact.length > 0 ? (
          <div className="mt-1.5 text-[10.5px] text-ink-prose">{contact.join(' · ')}</div>
        ) : null}
      </div>

      {structure.summary ? (
        <p className="mt-4 text-[10.5px] leading-relaxed text-ink">{structure.summary}</p>
      ) : null}

      <Section title="Experience">
        {(structure.experience ?? []).map((e, i) => (
          <Entry key={i} title={e.title} sub={[e.org, e.location].filter(Boolean).join(' · ')} dates={e.dates} bullets={e.bullets ?? []} />
        ))}
      </Section>

      <Section title="Projects">
        {(structure.projects ?? []).map((p, i) => (
          <Entry key={i} title={p.name} sub={p.tech} dates={p.dates} bullets={p.bullets ?? []} />
        ))}
      </Section>

      <Section title="Education">
        {(structure.education ?? []).map((e, i) => (
          <Entry key={i} title={e.degree} sub={[e.school, e.location].filter(Boolean).join(' · ')} dates={e.dates} bullets={[]} />
        ))}
      </Section>

      {(structure.skills ?? []).length > 0 ? (
        <div className="mt-[18px]">
          <SectionHeading>Technical Skills</SectionHeading>
          <div className="mt-2 flex flex-col gap-1">
            {structure.skills.map((s, i) => (
              <div key={i} className="text-[10.5px] leading-snug text-ink">
                <span className="font-medium">{s.category}: </span>
                {s.items}
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
  title, sub, dates, bullets,
}: { title: string; sub: string; dates: string; bullets: string[] }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-medium text-ink">{title}</span>
        <span className="whitespace-nowrap text-[10.5px] text-ink-prose">{dates}</span>
      </div>
      {sub ? <div className="mt-0.5 text-[10.5px] italic text-ink-prose">{sub}</div> : null}
      {bullets.map((b, i) => (
        <div key={i} className="mt-1 flex gap-1.5">
          <span className="text-[10.5px] text-ink-faint">&bull;</span>
          <span className="text-[10.5px] leading-snug text-ink">{b}</span>
        </div>
      ))}
    </div>
  );
}

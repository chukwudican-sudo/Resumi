'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildResume, sectionStatus, type ContactFact, type EntryWithBullets } from '../../lib/buildResume';
import ResumePaper from '../applications/ResumePaper';
import ContactSection, { type Contact } from './ContactSection';
import EntrySection from './EntrySection';
import SkillsSection, { type SkillGroup } from './SkillsSection';

export type SectionKey = 'contact' | 'experience' | 'education' | 'projects' | 'skills';

/**
 * Where a resume gets built.
 *
 * A rail rather than a wizard: every section is reachable at any time, because
 * people do not fill a resume in order and being marched through one is what
 * makes these feel like paperwork. The preview beside it is the real resume,
 * rendered from what has been typed — not a thumbnail of a template.
 */
export default function SetupShell({
  initialEntries,
  initialFacts,
  initialContact,
}: {
  initialEntries: EntryWithBullets[];
  initialFacts: ContactFact[];
  initialContact: Contact;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('contact');
  const [entries, setEntries] = useState(initialEntries);
  const [facts, setFacts] = useState(initialFacts);
  const [contact, setContact] = useState(initialContact);
  const [, startTransition] = useTransition();

  const status = useMemo(() => sectionStatus(entries, facts), [entries, facts]);
  const resume = useMemo(() => buildResume(entries, facts), [entries, facts]);
  const doneCount = status.filter((s) => s.done).length;

  // The server is the source of truth, but re-reading after every keystroke
  // would make the preview lag behind typing. Local state mirrors the write.
  function afterSave() {
    startTransition(() => router.refresh());
  }

  const skillGroups: SkillGroup[] = useMemo(
    () =>
      facts
        .filter((f) => f.category === 'skill')
        .map((f) => {
          const colon = f.text.indexOf(':');
          return colon > 0
            ? { category: f.text.slice(0, colon).trim(), items: f.text.slice(colon + 1).trim() }
            : { category: 'Skills', items: f.text.trim() };
        }),
    [facts],
  );

  return (
    <main className="flex min-h-screen flex-col bg-ground font-sans text-ink">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-rule bg-ground-surface px-8">
        <div className="flex items-center gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-ink-muted">{doneCount} of 5 sections</span>
          <Link
            href="/applications"
            className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Done
          </Link>
        </div>
      </div>

      <div className="grid flex-grow grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_380px]">
        {/* rail */}
        <nav className="border-b border-rule px-5 py-6 lg:border-b-0 lg:border-r">
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {status.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-left transition lg:w-full ${
                  section === s.key ? 'bg-accent-tint' : 'hover:bg-ground-panel'
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                    s.done ? 'bg-accent' : 'border-[1.5px] border-rule-field'
                  }`}
                >
                  {s.done ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : null}
                </span>
                <span className="flex flex-col">
                  <span className={`text-sm ${section === s.key ? 'text-ink' : 'text-ink-prose'}`}>
                    {s.label}
                  </span>
                  <span className="hidden text-[12px] text-ink-faint lg:block">{s.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        {/* the section being edited */}
        <div className="overflow-y-auto px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-[560px]">
            {section === 'contact' ? (
              <ContactSection
                contact={contact}
                onChange={setContact}
                onSaved={(next) => {
                  setFacts((f) => [
                    ...f.filter((x) => x.category !== 'identity'),
                    { category: 'identity', text: `Name: ${next.name}` },
                    { category: 'identity', text: `Email: ${next.email}` },
                    { category: 'identity', text: `Phone: ${next.phone}` },
                    { category: 'identity', text: `Location: ${next.location}` },
                    { category: 'identity', text: `LinkedIn: ${next.linkedin}` },
                    { category: 'identity', text: `Website: ${next.website}` },
                  ].filter((x) => !x.text.endsWith(': ')));
                  afterSave();
                }}
                onNext={() => setSection('experience')}
              />
            ) : section === 'skills' ? (
              <SkillsSection
                groups={skillGroups}
                onSaved={(next) => {
                  setFacts((f) => [
                    ...f.filter((x) => x.category !== 'skill'),
                    ...next.map((g) => ({ category: 'skill', text: `${g.category}: ${g.items}` })),
                  ]);
                  afterSave();
                }}
              />
            ) : (
              <EntrySection
                kind={section === 'experience' ? 'experience' : section === 'education' ? 'education' : 'project'}
                entries={entries}
                onChange={(next) => { setEntries(next); afterSave(); }}
                onNext={() =>
                  setSection(section === 'experience' ? 'education' : section === 'education' ? 'projects' : 'skills')
                }
              />
            )}
          </div>
        </div>

        {/* the actual resume, not a thumbnail */}
        <aside className="hidden flex-col items-center border-l border-rule bg-ground-band px-6 py-8 lg:flex">
          <span className="mb-4 self-start text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Your resume
          </span>
          <div className="w-full origin-top scale-[0.86]">
            <ResumePaper structure={resume} />
          </div>
        </aside>
      </div>
    </main>
  );
}

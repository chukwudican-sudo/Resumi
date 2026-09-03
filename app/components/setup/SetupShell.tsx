'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildResume, isResumeUsable, sectionStatus, type ContactFact, type EntryWithBullets } from '../../lib/buildResume';
import ResumePaper from '../applications/ResumePaper';
import DownloadPdf from '../applications/DownloadPdf';
import PolishButton from './PolishButton';
import type { ResumeStructure } from '../../lib/types';
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
  polished,
  stale,
}: {
  initialEntries: EntryWithBullets[];
  initialFacts: ContactFact[];
  initialContact: Contact;
  polished: ResumeStructure | null;
  stale: boolean;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('contact');
  const [contact, setContact] = useState(initialContact);
  const [, startTransition] = useTransition();

  // Entries and facts come straight from props rather than being copied into
  // state. router.refresh() re-renders the server component and hands down new
  // props, but a client component keeps its own state across that — so a copy
  // would still show the list as it was before the save, and an entry someone
  // just added would not appear until a full reload.
  const entries = initialEntries;
  const facts = initialFacts;

  const status = useMemo(() => sectionStatus(entries, facts), [entries, facts]);
  // Once the editorial pass has run, that is the resume — showing the raw
  // build beside a Download button that produces the polished one would be a
  // preview of something the person never receives.
  const built = useMemo(() => buildResume(entries, facts), [entries, facts]);
  const resume = polished ?? built;
  const doneCount = status.filter((s) => s.done).length;
  // Offering a download of a resume with no name and no history on it would
  // produce a page nobody wants to have sent.
  const usable = useMemo(() => isResumeUsable(entries, facts), [entries, facts]);

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
    <main className="flex h-screen flex-col overflow-hidden bg-ground font-sans text-ink">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-rule bg-ground-surface px-8">
        <div className="flex items-center gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-ink-muted">{doneCount} of 5 sections</span>
          {usable ? <PolishButton stale={stale} /> : null}
          {usable ? <DownloadPdf /> : null}
          <Link
            href="/applications"
            className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Done
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-grow grid-cols-1 overflow-y-auto lg:grid-cols-[220px_minmax(0,1fr)_380px] lg:overflow-hidden">
        {/* rail */}
        <nav className="min-h-0 border-b border-rule px-5 py-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
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
        <div className="min-h-0 px-6 py-8 sm:px-10 lg:overflow-y-auto">
          <div className="mx-auto max-w-[560px]">
            {section === 'contact' ? (
              <ContactSection
                contact={contact}
                onChange={setContact}
                onSaved={afterSave}
                onNext={() => setSection('experience')}
              />
            ) : section === 'skills' ? (
              <SkillsSection
                groups={skillGroups}
                onSaved={afterSave}
              />
            ) : (
              <EntrySection
                kind={section === 'experience' ? 'experience' : section === 'education' ? 'education' : 'project'}
                entries={entries}
                onChange={afterSave}
                onNext={() =>
                  setSection(section === 'experience' ? 'education' : section === 'education' ? 'projects' : 'skills')
                }
              />
            )}
          </div>
        </div>

        {/* the actual resume, not a thumbnail */}
        <aside className="hidden min-h-0 flex-col items-center border-l border-rule bg-ground-band px-6 py-8 lg:flex lg:overflow-y-auto">
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

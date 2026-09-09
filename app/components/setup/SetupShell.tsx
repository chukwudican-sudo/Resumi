'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildResume, isResumeUsable, sectionStatus, type ContactFact, type EntryWithBullets } from '../../lib/buildResume';
import { hasQuantity, profileStrength } from '../../lib/profileStrength';
import PdfPreview from '../applications/PdfPreview';
import MaterialList from './MaterialList';
import { checkReadiness } from '../../lib/readiness';
import DownloadPdf from '../applications/DownloadPdf';
import PolishButton from './PolishButton';
import type { ResumeSection, ResumeStructure } from '../../lib/types';
import { contentFor, entryKindFor, planSections } from '../../lib/sections';
import ContactSection, { type Contact } from './ContactSection';
import EntrySection from './EntrySection';
import SkillsSection, { type SkillGroup } from './SkillsSection';
import ProseSection from './ProseSection';
import ListSection from './ListSection';

/**
 * Which section is open. Any key this person's resume actually has, plus
 * 'contact' — which is authored here and printed as the header rather than as a
 * section of its own.
 */
export type SectionKey = string;

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
  initialSections,
  polished,
  stale,
  savedAt,
}: {
  initialEntries: EntryWithBullets[];
  initialFacts: ContactFact[];
  initialContact: Contact;
  /** This person's own sections. Empty means the conventional set. */
  initialSections: ResumeSection[];
  polished: ResumeStructure | null;
  stale: boolean;
  savedAt: string;
}) {
  const router = useRouter();

  // Which section opens is local state, not a route — but it can be aimed from
  // outside. The cards elsewhere that offer to add a missing skill need to land
  // on Skills rather than on Contact, and a link is a great deal simpler than
  // teaching them to drive this component.
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SectionKey>(() => searchParams.get('section') || 'contact');
  const [contact, setContact] = useState(initialContact);

  // Polishing reads the database and writes corrections back to it, while an
  // open form holds its own copy in memory. Saving that copy afterwards puts
  // the old text back and the correction disappears — so the two are not
  // allowed to happen at once.
  const [dirty, setDirty] = useState(false);

  /**
   * Whether the contact details have been saved on this visit.
   *
   * Polish and Download stay shut until they have. The form already refuses to
   * save a link that is not a link — it lights up the field and stops — so
   * requiring the save is what makes that check unavoidable. Before this, an
   * imported value nobody had typed was never put to it: a resume arrived with
   * the word "LinkedIn" in the LinkedIn box, polished, downloaded, and went out
   * carrying a link that pointed at nothing.
   *
   * Per visit rather than remembered. Saving is one click and it is the first
   * thing on the page, while a rule that only checked new accounts would let
   * every returning one straight past it.
   */
  const [contactSaved, setContactSaved] = useState(false);
  const [, startTransition] = useTransition();

  // Entries and facts come straight from props rather than being copied into
  // state. router.refresh() re-renders the server component and hands down new
  // props, but a client component keeps its own state across that — so a copy
  // would still show the list as it was before the save, and an entry someone
  // just added would not appear until a full reload.
  const entries = initialEntries;
  const facts = initialFacts;
  const sections = initialSections;

  // Once the editorial pass has run, that is the resume — showing the raw
  // build beside a Download button that produces the polished one would be a
  // preview of something the person never receives.
  const built = useMemo(() => buildResume(entries, facts, sections), [entries, facts, sections]);
  // The rail and the page are read off the same plan, so they cannot disagree
  // about the order — which they did, visibly, until this.
  const status = useMemo(() => sectionStatus(built), [built]);
  const open = useMemo(() => status.find((s) => s.key === section) ?? status[0], [status, section]);
  const resume = polished ?? built;
  const doneCount = status.filter((s) => s.done).length;
  // Offering a download of a resume with no name and no history on it would
  // produce a page nobody wants to have sent.
  const usable = useMemo(() => isResumeUsable(entries, facts), [entries, facts]);
  // Where 'Save and continue' goes: the next section in the rail, wrapping to
  // the first. Hardcoding the successor per section is how a new one ends up
  // being a dead end nothing leads out of.
  const nextKey = status[(status.findIndex((s) => s.key === open?.key) + 1) % status.length]?.key ?? 'contact';

  // Whether there is enough here to compile. The same check the download and
  // the preview endpoint make, so the pane never shows a resume that the
  // buttons beside it would refuse to produce.
  const ready = useMemo(() => checkReadiness(resume).ready, [resume]);

  // Scored here rather than read from profiles.strength, and scored on `built`
  // rather than on `resume`. The stored figure lags a save behind, and the
  // polished structure holds rewritten bullets — either would put a number in
  // the rail that disagrees with the marks two columns over, which are read off
  // these same rows. This way the two cannot contradict each other, and the
  // score moves the moment somebody types a number.
  const strength = useMemo(() => profileStrength(built), [built]);

  // Which sections still hold an entry whose bullets carry no number. Counted
  // per section rather than as one total: the line below is a jump, and a count
  // spanning experience and projects has nowhere honest to land.
  const thin = useMemo(() => {
    const count = (list: { bullets?: string[] }[]) =>
      list.filter((e) => (e.bullets ?? []).length > 0 && !(e.bullets ?? []).some(hasQuantity)).length;
    return (
      [
        { key: 'experience' as const, noun: 'experience', count: count(built.experience ?? []) },
        { key: 'projects' as const, noun: 'project', count: count(built.projects ?? []) },
      ] satisfies { key: string; noun: string; count: number }[]
    ).filter((w) => w.count > 0);
  }, [built]);

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

  // Read off the built resume rather than the rows, so the editor is filled
  // with exactly what the page beside it is printing.
  function proseOf(key: string): string {
    const content = contentFor(built, { key, label: '', shape: 'prose', optional: true });
    return content.shape === 'prose' ? content.text : '';
  }

  function itemsOf(key: string): string[] {
    const content = contentFor(built, { key, label: '', shape: 'list', optional: true });
    return content.shape === 'list' ? content.items : [];
  }

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
          <span className="text-[13px] text-ink-muted">{doneCount} of {status.length} sections</span>
          {dirty ? (
            <span className="text-[12.5px] text-ink-faint">Save or cancel first</span>
          ) : null}
          {usable ? <PolishButton stale={stale} disabled={dirty || !contactSaved} /> : null}
          {usable ? <DownloadPdf polishFirst={stale} disabled={dirty || !contactSaved} /> : null}
          <Link
            href="/applications"
            className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Done
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-grow grid-cols-1 overflow-y-auto lg:grid-cols-[252px_minmax(0,1fr)_minmax(560px,0.42fr)] lg:overflow-hidden">
        {/* rail */}
        <nav className="min-h-0 border-b border-rule px-5 py-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {status.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setDirty(false); setSection(s.key); }}
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

          {/*
            The diagnosis, which used to live on a separate read-only page that
            listed the same entries over again. Here it sits beside the forms
            that answer it.

            Inset by the same 12px as the section labels above: the buttons
            carry their own padding, so a block flush to the rail's edge left a
            ragged margin down the column with the text in two different places.

            Hidden below lg, where this same nav is a horizontal strip of
            buttons: a status card in that strip would scroll off sideways next
            to them, and on a phone the marks on each entry are the useful half.
          */}
          <div className="mt-7 hidden border-t border-rule pt-7 lg:block">
            <div className="flex flex-col px-3">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Profile strength
              </span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-serif text-[38px] leading-none">{strength}</span>
                <span className="text-[13px] text-ink-faint">/ 100</span>
              </div>
              <div className="mt-3.5 h-1 overflow-hidden rounded-sm bg-rule">
                <div
                  className="h-full rounded-sm bg-accent transition-[width] duration-500"
                  style={{ width: `${strength}%` }}
                />
              </div>
              <p className="mt-3.5 text-[12.5px] leading-relaxed text-ink-muted">
                The stronger this is, the less you edit after every tailor.
              </p>

              {/*
                A suggestion, not a correction. This replaced an amber banner
                under a warning triangle reading "One entry has no numbers in
                it — a few questions would fix it", which stated a defect about
                somebody's career and offered twenty-five questions to mend one
                bullet. Nothing here is flag-coloured, nothing carries an icon,
                and once every entry has a number the block renders nothing
                rather than turning green.
              */}
              {thin.length ? (
                <div className="mt-6 flex flex-col gap-2">
                  <p className="text-[12.5px] leading-relaxed text-ink-muted">
                    Numbers are what make a bullet land &mdash; a percentage, a count, time saved.
                  </p>
                  {thin.map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => { setDirty(false); setSection(w.key); }}
                      className="text-left text-[12.5px] leading-relaxed text-accent transition hover:text-accent-hover hover:underline hover:underline-offset-2"
                    >
                      {w.count} {w.noun} {w.count === 1 ? 'entry does' : 'entries do'} not have one yet &rarr;
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

        </nav>

        {/* the section being edited */}
        <div className="min-h-0 px-6 py-8 sm:px-10 lg:overflow-y-auto">
          <div className="mx-auto max-w-[560px]">
            {/*
              Dispatched on SHAPE, not on name — the same decision the renderer
              makes two columns over. There are five ways to edit a section and
              three of them already existed, which is what made an unfamiliar
              section affordable: Extracurriculars is Experience with a
              different heading, not a new editor.

              Keyed on the section throughout. Without that, React sees the same
              element type in the same position and keeps the instance — so an
              entry left open for editing stayed open when you moved to another
              section, and its form re-rendered under the new kind holding the
              old entry's data.
            */}
            {!open || open.shape === 'contact' ? (
              <ContactSection
                contact={contact}
                onChange={setContact}
                onSaved={() => { setContactSaved(true); afterSave(); }}
                onNext={() => setSection(nextKey)}
                onDirty={setDirty}
              />
            ) : open.shape === 'groups' ? (
              <SkillsSection
                key={open.key}
                groups={skillGroups}
                onSaved={afterSave}
                onDirty={setDirty}
              />
            ) : open.shape === 'prose' ? (
              <ProseSection
                key={open.key}
                sectionKey={open.key}
                label={open.label}
                text={proseOf(open.key)}
                onSaved={afterSave}
                onDirty={setDirty}
              />
            ) : open.shape === 'list' ? (
              <ListSection
                key={open.key}
                sectionKey={open.key}
                label={open.label}
                items={itemsOf(open.key)}
                onSaved={afterSave}
                onDirty={setDirty}
              />
            ) : (
              <EntrySection
                key={open.key}
                kind={entryKindFor(open.key)}
                label={open.label}
                entries={entries}
                onChange={afterSave}
                onNext={() => setSection(nextKey)}
                onDirty={setDirty}
              />
            )}
          </div>
        </div>

        {/* the actual resume, not a thumbnail */}
        <aside className="hidden min-h-0 flex-col items-center border-l border-rule bg-ground-band px-6 py-8 lg:flex lg:overflow-y-auto">
          {ready ? (
            // The real document, once there is enough to make one. Not a
            // drawing of it — the drawing and the download disagreed about
            // section order, coursework and page count within one week.
            <>
              <span className="mb-4 self-start text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Your resume
              </span>
              <PdfPreview reloadKey={savedAt} />
            </>
          ) : (
            <MaterialList entries={entries} facts={facts} sections={sections} />
          )}
        </aside>
      </div>
    </main>
  );
}

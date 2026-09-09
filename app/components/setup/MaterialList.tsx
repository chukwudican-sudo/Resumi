import { formatDates, formatPlace } from '../../lib/entryFormat';
import { titleWithEmployment } from '../../lib/employment';
import { composeDegree } from '../../lib/degree';
import type { ContactFact, EntryWithBullets } from '../../lib/buildResume';
import { KNOWN_SHAPES as DEFAULT_SHAPES, entryKindFor } from '../../lib/sections';
import type { ResumeSection } from '../../lib/types';

/**
 * What you have collected, while you are still collecting it.
 *
 * Deliberately not a drawing of the resume. A second rendering of the same
 * document drifts from the real one — ours disagreed about section order, about
 * whether coursework existed, and about whether the whole thing fitted on one
 * page — and it drifts in the state where somebody is least able to notice,
 * because they have never seen the real one to compare against.
 *
 * This cannot drift, because it is not claiming to be the resume. It is a view
 * of the entries: what is in, what each one has, and what it still needs. Once
 * there is enough to compile, the pane shows the actual PDF instead.
 */

interface Item {
  title: string;
  detail: string;
  gap: string | null;
}

function bulletCount(bullets: string[]): number {
  return bullets.filter((b) => b.trim()).length;
}

function describe(entry: EntryWithBullets, kind: string): Item {
  const dates = formatDates(
    {
      startMonth: entry.startMonth ?? null,
      startYear: entry.startYear ?? null,
      endMonth: entry.endMonth ?? null,
      endYear: entry.endYear ?? null,
      isCurrent: entry.isCurrent ?? false,
    },
    kind,
    entry.datesDisplay,
  );
  const place = formatPlace(
    { city: entry.city ?? null, region: entry.region ?? null, country: entry.country ?? null },
    entry.location,
  );
  const count = bulletCount(entry.bullets ?? []);
  const lines = count ? `${count} ${count === 1 ? 'bullet' : 'bullets'}` : null;

  if (kind === 'education') {
    return {
      title: composeDegree(entry.extra?.credential, entry.title) || 'Untitled',
      detail: [entry.org, dates, place].filter(Boolean).join(' · '),
      // Education is the one kind that reads fine without bullets, so a missing
      // date is the only thing worth flagging.
      gap: !dates ? 'No dates yet' : null,
    };
  }

  return {
    title:
      kind === 'experience'
        ? titleWithEmployment(entry.title ?? 'Untitled', entry.extra?.employment)
        : entry.title || 'Untitled',
    detail: [kind === 'project' ? entry.tech : entry.org, dates, place, lines]
      .filter(Boolean)
      .join(' · '),
    gap: !count ? 'No bullets yet' : !dates ? 'No dates yet' : null,
  };
}

function Group({ label, items }: { label: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.11em] text-ink-faint">
        {label} <span className="text-ink-ghost">{items.length}</span>
      </span>
      {items.map((item, i) => (
        <div
          key={i}
          // The stripe is the whole status indicator: green when the entry is
          // finished, amber when it is not. A gap sits on the entry that has
          // it rather than in a list somewhere else, so the thing to fix and
          // the thing you would click are the same line.
          className={`flex flex-col gap-0.5 rounded border border-l-2 border-rule bg-ground-surface px-3 py-2 ${
            item.gap ? 'border-l-flag' : 'border-l-accent'
          }`}
        >
          <span className="text-[12.5px] leading-snug text-ink">{item.title}</span>
          {item.detail ? (
            <span className="text-[11px] leading-snug text-ink-muted">{item.detail}</span>
          ) : null}
          {item.gap ? <span className="text-[11px] text-flag">{item.gap}</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function MaterialList({
  entries,
  facts,
  sections = [],
}: {
  entries: EntryWithBullets[];
  facts: ContactFact[];
  /** This person's own sections. Empty means the conventional three. */
  sections?: ResumeSection[];
}) {
  const byKind = (kind: string) =>
    entries
      .filter((e) => e.kind === kind)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => describe(e, kind));

  // Grouped by the sections this person has, not by a fixed three. This pane is
  // what somebody sees before their resume has enough on it to compile, so a
  // section missing from here reads as "it did not import my activities" at
  // exactly the moment they are checking whether it did.
  const groups = (
    sections.length
      ? sections
          .filter((s) => (s.shape ?? DEFAULT_SHAPES[s.key]) === 'entries' || (s.shape ?? DEFAULT_SHAPES[s.key]) === 'inline')
          .map((s) => ({ label: s.label, items: byKind(entryKindFor(s.key)) }))
      : [
          { label: 'Education', items: byKind('education') },
          { label: 'Experience', items: byKind('experience') },
          { label: 'Projects', items: byKind('project') },
        ]
  ).filter((g) => g.items.length);

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  // Split on commas so a group typed as "Python, Java" shows as two, which is
  // how they will be read.
  const skills = facts
    .filter((f) => f.category === 'skill')
    .flatMap((f) => {
      const colon = f.text.indexOf(':');
      return (colon > 0 ? f.text.slice(colon + 1) : f.text).split(',');
    })
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 14);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Your material</span>
        <span className="text-[11px] tabular-nums text-ink-muted">
          {total} {total === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {total === 0 && !skills.length ? (
        <p className="rounded border border-dashed border-rule-field px-4 py-8 text-center text-[13px] leading-relaxed text-ink-faint">
          Nothing yet. What you add appears here as you save it.
        </p>
      ) : null}

      <div className="flex flex-col gap-3.5">
        {groups.map((g) => (
          <Group key={g.label} label={g.label} items={g.items} />
        ))}

        {skills.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.11em] text-ink-faint">Skills</span>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-rule bg-ground-surface px-2.5 py-1 text-[11px] text-ink-prose"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {total > 0 ? (
        <div className="mt-1 flex gap-4 text-[11.5px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-sm bg-accent" /> complete
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-sm bg-flag" /> missing something
          </span>
        </div>
      ) : null}
    </div>
  );
}

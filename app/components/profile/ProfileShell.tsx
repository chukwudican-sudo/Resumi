'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Header from '../Header';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { computeCoverage } from '../../lib/interview/coverage';
import { emptyInterviewState, type InterviewState } from '../../lib/interview/state';
import {
  CAREER_STAGE_LABELS,
  emptyOnboarding,
  type BaseResumeState,
  type OnboardingState,
  type ResumeStructure,
} from '../../lib/types';

/**
 * Everything Resumi knows about the person, and the way back in to add more.
 *
 * This is the destination the interview used to occupy in the nav. The
 * interview itself is a thing you do, not a place you go, so it lives behind
 * the actions here instead of beside Workspace and Review.
 */
export default function ProfileShell() {
  const [structure] = useLocalStorageState<ResumeStructure | null>('resumi-source-structure', null);
  const [baseResume] = useLocalStorageState<BaseResumeState>('resumi-base-resume', {
    loaded: false, fileName: '', updatedAt: '', warning: null,
  });
  const [interview] = useLocalStorageState<InterviewState>('resumi-interview', emptyInterviewState());
  const [onboarding] = useLocalStorageState<OnboardingState>('resumi-onboarding', emptyOnboarding);

  // Only meaningful once the interview has run; an uploaded resume produces a
  // structure but no facts, so its coverage is computed from the structure below.
  const coverage = useMemo(
    () => computeCoverage(interview.entries, interview.facts),
    [interview.entries, interview.facts],
  );

  /**
   * Entries whose bullets carry no digit at all.
   *
   * For an uploaded resume there are no facts to score, so this stands in for
   * coverage: a bullet with no number is the single most common weakness in a
   * resume, and it is exactly what a few follow-up questions can fix.
   */
  const thinEntries = useMemo(() => {
    if (!structure) return [];
    const weak: string[] = [];
    for (const job of structure.experience ?? []) {
      if (!(job.bullets ?? []).some((b) => /\d/.test(b))) weak.push(`${job.title} at ${job.org}`);
    }
    for (const project of structure.projects ?? []) {
      if (!(project.bullets ?? []).some((b) => /\d/.test(b))) weak.push(project.name);
    }
    return weak;
  }, [structure]);

  if (!structure) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl">
          <section className="resume-card p-8 text-center shadow-lg shadow-slate-950/10">
            <h2 className="text-2xl font-semibold text-white">No profile yet</h2>
            <p className="mt-3 text-sm text-slate-400">
              Upload a resume or answer a few questions, and everything Resumi knows about you will live here.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-block rounded-3xl bg-accent px-6 py-3 font-semibold text-slate-950 transition hover:bg-blue-500"
            >
              Build my profile
            </Link>
          </section>
        </div>
      </Shell>
    );
  }

  const sourceLabel = interview.turns.length > 0
    ? 'Built from your answers'
    : baseResume.fileName || 'Uploaded resume';

  return (
    <Shell>
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{sourceLabel}</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">{structure.name || 'Your profile'}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {[structure.contact?.email, structure.contact?.phone, structure.contact?.linkedin]
                .filter(Boolean)
                .join(' · ') || 'No contact details captured'}
            </p>
          </section>

          {thinEntries.length ? (
            <section className="rounded-3xl border border-warning/30 bg-warning/10 px-6 py-5">
              <p className="text-sm font-semibold text-warning">
                {thinEntries.length} {thinEntries.length === 1 ? 'entry has' : 'entries have'} no measurable results
              </p>
              <p className="mt-2 text-sm text-warning/90">
                Numbers are what make a resume land. A few questions about {thinEntries.slice(0, 2).join(' and ')}
                {thinEntries.length > 2 ? ' and others' : ''} would strengthen{' '}
                {thinEntries.length === 1 ? 'it' : 'them'}.
              </p>
              <Link
                href="/interview"
                className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-500"
              >
                Answer a few questions
              </Link>
            </section>
          ) : null}

          <Section title="Experience">
            {(structure.experience ?? []).map((job, i) => (
              <Entry key={i} heading={job.title} sub={job.org} dates={job.dates} bullets={job.bullets} />
            ))}
          </Section>

          <Section title="Projects">
            {(structure.projects ?? []).map((project, i) => (
              <Entry key={i} heading={project.name} sub={project.tech} dates={project.dates} bullets={project.bullets} />
            ))}
          </Section>

          <Section title="Education">
            {(structure.education ?? []).map((school, i) => (
              <Entry key={i} heading={school.degree} sub={school.school} dates={school.dates} bullets={[]} />
            ))}
          </Section>

          <Section title="Skills">
            {(structure.skills ?? []).map((group, i) => (
              <p key={i} className="text-sm text-slate-300">
                <span className="text-slate-500">{group.category}: </span>
                {group.items}
              </p>
            ))}
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="resume-card p-5 shadow-lg shadow-slate-950/10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Looking for</p>
            <p className="mt-3 text-sm text-white">
              {onboarding.stage ? CAREER_STAGE_LABELS[onboarding.stage] : 'Not set'}
            </p>
            {onboarding.targetField ? (
              <p className="mt-1 text-sm text-slate-400">{onboarding.targetField}</p>
            ) : null}
          </div>

          {interview.turns.length ? (
            <div className="resume-card p-5 shadow-lg shadow-slate-950/10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">From your answers</p>
              <p className="mt-3 text-sm text-slate-300">
                {interview.facts.length} details over {interview.turns.length} questions
              </p>
              <p className="mt-1 text-sm text-slate-500">{Math.round(coverage.overall * 100)}% coverage</p>
            </div>
          ) : null}

          <Link
            href="/interview"
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm text-slate-200 transition hover:border-slate-500"
          >
            Add more detail
          </Link>
          <Link
            href="/"
            className="rounded-full bg-accent px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:bg-blue-500"
          >
            Tailor for a job
          </Link>
        </aside>
      </div>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) return null;
  return (
    <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{title}</p>
      <div className="mt-4 flex flex-col gap-5">{items}</div>
    </section>
  );
}

function Entry({
  heading, sub, dates, bullets,
}: { heading: string; sub: string; dates: string; bullets: string[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-white">{heading}</p>
        <p className="text-xs text-slate-500">{dates}</p>
      </div>
      {sub ? <p className="text-sm text-slate-400">{sub}</p> : null}
      {bullets.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {bullets.map((bullet, i) => (
            <li key={i} className="text-sm text-slate-300">
              <span className="text-slate-600">• </span>
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-[1440px]">
        <Header active="profile" title="Your profile" subtitle="Everything Resumi knows about you." />
        {children}
      </div>
    </main>
  );
}

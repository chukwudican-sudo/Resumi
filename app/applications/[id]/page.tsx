import { notFound } from 'next/navigation';
import ApplicationView from '../../components/applications/ApplicationView';
import type { ApplicationStatus } from '../../components/applications/ApplicationRow';
import type { ResumeStructure } from '../../lib/types';
import { requireUserId } from '../../server/auth';
import { getActiveRules, getApplication, getLatestResume, getResumeVersion, listResumeVersions } from '../../server/db/repository';
import { runChecks } from '../../lib/ruleCheck';
import type { RuleCheck } from '../../lib/rules';

/**
 * One application: its posting, and the resume written for it.
 *
 * Not two resumes side by side. At this moment you are checking the thing you
 * are about to send, not comparing it with what you had — comparison belongs in
 * the version history, where it is asked for rather than assumed.
 */
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { v?: string };
}) {
  const userId = await requireUserId();

  const record = await getApplication(userId, params.id);
  if (!record) notFound();

  // Which version is being read, from the URL. Browsing history used to mean
  // restoring — the picker's only action copied a version forward — so looking
  // at what you had was indistinguishable from changing what you have.
  const asked = Number(searchParams?.v);
  const wanted = Number.isFinite(asked) && asked > 0 ? asked : null;

  const [latest, versions, rules] = await Promise.all([
    getLatestResume(userId, params.id),
    listResumeVersions(userId, params.id),
    getActiveRules(userId),
  ]);

  // An unknown version falls back rather than 404s: a stale link should show
  // the resume, not an error page.
  const viewed =
    wanted && wanted !== latest?.version
      ? (await getResumeVersion(userId, params.id, wanted)) ?? latest
      : latest;

  const resume = viewed;
  const isLatest = !resume || !latest || resume.version === latest.version;

  return (
    <ApplicationView
      applicationId={params.id}
      isLatest={isLatest}
      /*
       * Checked here, not stored.
       *
       * Scanning a resume for a forbidden word costs nothing, so there is no
       * reason to persist a verdict that could go stale. Running it on render
       * also means a rule written today is applied to a resume tailored last
       * week — and says so.
       */
      ruleResults={
        viewed
          ? runChecks(
              viewed.structure as ResumeStructure,
              rules.map((r) => ({ id: r.id, text: r.text, check: (r.check as RuleCheck) ?? null })),
            )
          : []
      }
      versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
      status={record.application.status as ApplicationStatus}
      posting={{
        company: record.posting?.company ?? null,
        role: record.posting?.role ?? null,
        location: record.posting?.location ?? null,
        description: record.posting?.description ?? null,
        sourceUrl: record.posting?.sourceUrl ?? null,
        requirements: (record.posting?.requirements as string[]) ?? [],
      }}
      resume={
        resume
          ? {
              structure: resume.structure as ResumeStructure,
              matchScore: resume.matchScore,
              missingRequirements: (resume.missingRequirements as string[]) ?? [],
              log: (resume.log as string[]) ?? [],
              warnings: (resume.warnings as string[]) ?? [],
              version: resume.version,
            }
          : null
      }
    />
  );
}

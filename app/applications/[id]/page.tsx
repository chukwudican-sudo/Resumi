import { notFound } from 'next/navigation';
import ApplicationView from '../../components/applications/ApplicationView';
import type { ResumeStructure } from '../../lib/types';
import { requireUserId } from '../../server/auth';
import { getApplication, getLatestResume } from '../../server/db/repository';

/**
 * One application: its posting, and the resume written for it.
 *
 * Not two resumes side by side. At this moment you are checking the thing you
 * are about to send, not comparing it with what you had — comparison belongs in
 * the version history, where it is asked for rather than assumed.
 */
export default async function ApplicationPage({ params }: { params: { id: string } }) {
  const userId = await requireUserId();

  const record = await getApplication(userId, params.id);
  if (!record) notFound();

  const resume = await getLatestResume(userId, params.id);

  return (
    <ApplicationView
      applicationId={params.id}
      status={record.application.status}
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

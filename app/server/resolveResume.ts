import { buildDefaultFilenameBase } from '../lib/filename';
import type { ResumeStructure } from '../lib/types';
import { getApplication, getLatestResume, getProfile } from './db/repository';

/**
 * Which resume a request is about, and what its file should be called.
 *
 * Shared by the download and the preview so they cannot drift. They are the
 * same document — one is offered to save, the other is shown on screen — and
 * the fastest way to reintroduce the bug this preview work exists to kill would
 * be two places deciding separately what to render.
 *
 * Every read is scoped by userId, so naming an id belonging to somebody else
 * finds nothing rather than returning their resume.
 */
export type Resolved =
  | { ok: true; structure: ResumeStructure; filename: string }
  | { ok: false; status: 404; error: string };

export async function resolveResume(
  userId: string,
  applicationId?: string | null,
): Promise<Resolved> {
  if (applicationId) {
    const [record, resume] = await Promise.all([
      getApplication(userId, applicationId),
      getLatestResume(userId, applicationId),
    ]);
    if (!record || !resume) {
      return { ok: false, status: 404, error: 'No resume found for that application.' };
    }
    const structure = resume.structure as ResumeStructure;
    return {
      ok: true,
      structure,
      filename: `${buildDefaultFilenameBase(
        structure.name ?? '',
        record.posting?.role ?? '',
        record.posting?.company ?? '',
      )}.pdf`,
    };
  }

  const profile = await getProfile(userId);
  const structure = (profile?.resumeStructure as ResumeStructure | null) ?? null;
  if (!structure) {
    return { ok: false, status: 404, error: 'Your resume is empty. Add your details first.' };
  }

  return {
    ok: true,
    structure,
    filename: `${buildDefaultFilenameBase(structure.name ?? '', '', '')}.pdf`,
  };
}

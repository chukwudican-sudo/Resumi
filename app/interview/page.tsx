import InterviewFlow from '../components/interview/InterviewFlow';
import { computeCoverage } from '../lib/interview/coverage';
import type { Fact, InterviewPhase, InterviewQuestion, ProfileEntry } from '../lib/types';
import { requireUserId } from '../server/auth';
import { getActiveFacts, getActiveInterview, getProfileEntries } from '../server/db/repository';

/**
 * Picks the conversation back up exactly where it was.
 *
 * Everything comes from the database, so closing the tab mid-interview costs
 * nothing — the pending question was stored when it was asked, which means
 * resuming needs no model call at all.
 */
export default async function InterviewPage() {
  const userId = await requireUserId();
  const [session, entries, facts] = await Promise.all([
    getActiveInterview(userId),
    getProfileEntries(userId),
    getActiveFacts(userId),
  ]);

  const typedEntries: ProfileEntry[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind as ProfileEntry['kind'],
    title: e.title ?? undefined,
    org: e.org ?? undefined,
    location: e.location ?? undefined,
    datesDisplay: e.datesDisplay ?? undefined,
    orderIndex: e.orderIndex,
    source: e.source as ProfileEntry['source'],
  }));

  const typedFacts: Fact[] = facts.map((f) => ({
    id: f.id,
    entryId: f.entryId,
    category: f.category as Fact['category'],
    text: f.text,
    hasNumber: f.hasNumber,
    confidence: f.confidence,
    source: f.source as Fact['source'],
    sourceTurnId: f.sourceTurnId,
    status: 'active',
  }));

  const coverage = computeCoverage(typedEntries, typedFacts);

  return (
    <InterviewFlow
      initial={{
        question: (session?.pendingQuestion as InterviewQuestion | null) ?? null,
        entries: typedEntries,
        facts: typedFacts,
        turnCount: session?.turnCount ?? 0,
        coverage: coverage.overall,
        phase: (session?.phase as InterviewPhase) ?? 'identity',
        started: Boolean(session),
      }}
    />
  );
}

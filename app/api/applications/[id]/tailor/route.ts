import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError, callClaude } from '../../../../lib/anthropic';
import { TAILOR_INVARIANT, buildUserContext } from '../../../../lib/systemPrompt';
import type { ResumeStructure } from '../../../../lib/types';
import { surfaceRepairs, validateTailored } from '../../../../lib/tailorGuard';
import { requireUserId } from '../../../../server/auth';
import { MONTHLY_CREDITS } from '../../../../lib/credits';
import { polishIfStale } from '../../../../server/polishProfile';
import {
  getActiveRules,
  getUser,
  getApplication,
  getProfile,
  getSupportingFacts,
  refundCredit,
  saveResume,
  spendCredit,
} from '../../../../server/db/repository';
import { capacityResponse, TAILOR_TOOL, errorResponse, SERVICE_UNAVAILABLE } from '../../../claude/shared';

export const maxDuration = 60;

interface TailorResult {
  structure: ResumeStructure;
  log: string[];
  matchScore: number;
  missingRequirements: string[];
  vague: boolean;
  vagueReason: string;
  estimatedPages: number;
  structuralChanges: { description: string; reason: string }[];
  warnings: string[];
}

/** Rewrites the profile around one job posting and keeps the result. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 500);
  }

  const [record, profile, rules, user, supporting] = await Promise.all([
    getApplication(userId, params.id),
    getProfile(userId),
    getActiveRules(userId),
    getUser(userId),
    // What they have answered that is not on the resume. Until now these were
    // written and never read: somebody answered three questions about their
    // achievements, paid a credit to re-tailor, and got the same resume back.
    getSupportingFacts(userId),
  ]);

  if (!record) return errorResponse({ type: 'generic', message: 'Application not found.' }, 404);

  const profileStructure = (profile?.resumeStructure ?? null) as ResumeStructure | null;
  if (!profileStructure?.name) {
    return errorResponse({ type: 'generic', message: 'Build your profile first.' }, 400);
  }

  // Spend before generating. The other order lets two tabs both produce a
  // resume on the last remaining credit.
  const remaining = await spendCredit(userId);
  if (remaining === null) {
    return errorResponse(
      {
        type: 'generic',
        message: `You've used all ${MONTHLY_CREDITS} free applications this month. They come back on the 1st.`,
      },
      402,
    );
  }

  // Everything after the spend is inside the try, so there is no path that takes
  // a credit and leaves without either a resume or a refund. The editorial pass
  // below swallows its own failures, but the reads around it do not, and the
  // rule is easier to keep than to check line by line.
  try {
    // Polished after the gate, not before it.
    //
    // Tailoring reads the master resume, so it should read the good version of
    // it — feeding the model "Uses Python for backend algorithm work" as a skill
    // wastes the call it is about to make. But this runs the editorial pass,
    // which is two model calls of its own, and it used to run before anybody
    // checked whether there was a credit to spend. So somebody at zero paid
    // about three cents for a polish on every attempt and was then refused.
    const polished = await polishIfStale(userId);
    const structure = ((await getProfile(userId))?.resumeStructure ?? profileStructure) as ResumeStructure;

    const posting = record.posting;

    // Things they have told us that never made it onto the page. Offered as
    // material the tailor may use, never as licence to invent: each line is
    // something the person said in their own words, so working one in is
    // reporting rather than embellishing.
    const said = supporting.length
      ? [
          'Also true of this person, in their own words, from questions they have answered. These are NOT yet on the resume. Use any that the posting makes relevant — worked into an existing entry rather than added as a new one — and ignore the rest. They are the only other thing you may draw on, and you may not extrapolate beyond what each one says:',
          supporting.map((f) => `- ${f.text}`).join('\n'),
        ].join('\n')
      : null;

    const content = [
      {
        type: 'text' as const,
        text: [
          'Their profile — the Resume Structure to edit. This is the resume of record; keep the same entries, dates, and section identities, and rewrite freely within them:',
          '```json',
          JSON.stringify(structure, null, 2),
          '```',
          said,
          `Job posting — Company: ${posting?.company ?? '(not provided)'}, Role: ${posting?.role ?? '(not provided)'}\n${posting?.description ?? '(no description)'}`,
          said
            ? 'Produce the tailored resume now via submit_tailored_resume. The structure and the lines above it are your only sources for what this person has done — tailor within them and invent nothing to fill gaps.'
            : 'Produce the tailored resume now via submit_tailored_resume. The structure above is your only source for what this person has done, so tailor within it and invent nothing to fill gaps.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ];

    const { toolInput } = await callClaude<TailorResult>({
      userId,
      kind: 'tailor',
      system: TAILOR_INVARIANT,
      systemSuffix: buildUserContext({
        displayName: structure.name || user?.displayName,
        locale: user?.locale,
        rules,
        stage: user?.stage,
        targetField: user?.targetField,
      }),
      content,
      tool: TAILOR_TOOL,
    });

    // Checked before it is stored, because a tailored resume came back missing
    // a fifteen-month job and nothing noticed. The model's own change log had
    // sixteen entries and mentioned that role in none of them, and its warnings
    // were empty — three self-reports from one pass, all silent, which is why
    // this is arithmetic rather than another line of prompt.
    const guarded = validateTailored(structure, toolInput.structure);
    const surfaced = surfaceRepairs(guarded.repairs);

    const restored = guarded.repairs.filter((r) => r.kind === 'entry').length;
    if (restored) {
      // Countable without a database query. An entry going missing is the
      // model breaking a rule it was given, and it should be visible that it
      // happens rather than only that it was caught.
      console.error(`[Resumi] Tailoring dropped ${restored} entr${restored === 1 ? 'y' : 'ies'}; restored from the profile.`);
    }

    // The model reports its own structural decisions and this was thrown away.
    // Shown alongside the guard and never instead of it: a bullet moved from
    // one job to another is a claim moved between employers, and until now
    // nobody ever saw that happen.
    const structural = (toolInput.structuralChanges ?? [])
      .filter((c) => c && typeof c.description === 'string')
      .map((c) => `Structural: ${c.description}${c.reason ? ` — ${c.reason}` : ''}`);

    const resumeId = await saveResume(userId, params.id, {
      structure: guarded.structure,
      matchScore: toolInput.matchScore ?? null,
      missingRequirements: toolInput.missingRequirements ?? [],
      // Guard lines lead. The point of a restore notice is lost at item
      // fourteen of sixteen.
      log: [...surfaced.log, ...structural, ...(toolInput.log ?? [])],
      warnings: [...surfaced.warnings, ...(toolInput.warnings ?? [])],
      estimatedPages: toolInput.estimatedPages ?? null,
    });

    // Said out loud rather than done quietly: polishing regroups skills and
    // can reorder sections, and finding that out from a resume you already
    // sent is worse than being told now.
    return NextResponse.json({
      resumeId,
      creditsLeft: remaining,
      polished: polished ? { corrections: polished.corrections, warnings: polished.warnings } : null,
    });
  } catch (error) {
    // Nothing was produced, so the credit goes back.
    //
    // Every failure below lands here, and `saveResume` is the last thing before
    // the success return — so reaching this catch means there is no tailored
    // resume anywhere. Charging for that is charging for an outage.
    await refundCredit(userId);

    const refused = capacityResponse(error);
    if (refused) return refused;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 401);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse({ type: 'network', message: 'Your internet connection dropped.' }, 503);
    }
    if (error instanceof NoToolUseError) {
      return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
    }
    console.error('[Resumi] Tailoring failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}

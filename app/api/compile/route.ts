import { NextRequest, NextResponse } from 'next/server';
import { renderResumeLatex } from '../../lib/latexEngine';
import { checkReadiness } from '../../lib/readiness';
import { buildDefaultFilenameBase } from '../../lib/filename';
import type { ResumeStructure } from '../../lib/types';
import { requireUserId } from '../../server/auth';
import { getApplication, getLatestResume, getProfile } from '../../server/db/repository';
import { LatexCompileError, compileToPdf } from '../../server/pdf';

// tectonic must run in Node (child_process), not the edge runtime.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Turns one of your saved resumes into a PDF.
 *
 * This endpoint used to accept a LaTeX string and compile whatever it was
 * given, from anyone, with no sign-in. That is remote code execution wearing a
 * hat: TeX can read files (`\input{/etc/passwd}` renders them into the returned
 * PDF) and loop forever, so the returned document was an exfiltration channel
 * and the timeout was a denial-of-service budget.
 *
 * The fix is not to filter the LaTeX — you cannot reliably filter a Turing
 * complete macro language. It is to stop accepting it. Callers name a resume
 * they own; the server loads it and renders the LaTeX itself. User text now
 * reaches TeX only as escaped arguments, through exactly one function.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();

  let body: { applicationId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { applicationId } = body;
  if (applicationId !== undefined && typeof applicationId !== 'string') {
    return NextResponse.json({ error: '"applicationId" must be a string' }, { status: 400 });
  }

  // Both reads are scoped by userId, so naming someone else's id finds nothing
  // rather than compiling their resume.
  let structure: ResumeStructure | null = null;
  let filename: string;

  if (applicationId) {
    const [record, resume] = await Promise.all([
      getApplication(userId, applicationId),
      getLatestResume(userId, applicationId),
    ]);
    if (!record || !resume) {
      return NextResponse.json({ error: 'No resume found for that application.' }, { status: 404 });
    }
    structure = resume.structure as ResumeStructure;
    filename = `${buildDefaultFilenameBase(
      structure.name ?? '',
      record.posting?.role ?? '',
      record.posting?.company ?? '',
    )}.pdf`;
  } else {
    const profile = await getProfile(userId);
    structure = (profile?.resumeStructure as ResumeStructure | null) ?? null;
    if (!structure) {
      return NextResponse.json(
        { error: 'Your resume is empty. Add your details first.' },
        { status: 404 },
      );
    }
    filename = `${buildDefaultFilenameBase(structure.name ?? '', '', '')}.pdf`;
  }

  // Checked here rather than only in the page, because a disabled button is a
  // suggestion — this is where the PDF is actually produced.
  const readiness = checkReadiness(structure);
  if (!readiness.ready) {
    return NextResponse.json(
      {
        error: 'This resume is not finished yet.',
        blocking: readiness.blocking,
      },
      { status: 422 },
    );
  }

  try {
    const pdf = await compileToPdf(renderResumeLatex(structure));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof LatexCompileError) {
      if (err.kind === 'config') {
        console.error(`[Resumi] ${err.message}`);
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      // The LaTeX was ours, so the log is our debugging material, not theirs —
      // and a TeX trace is not something to put in front of someone who only
      // asked for a PDF.
      console.error(`[Resumi] Resume failed to compile for ${userId}:\n${err.log}`);
      return NextResponse.json(
        { error: "We couldn't build that PDF. This one is on us — it has been logged." },
        { status: 500 },
      );
    }
    throw err;
  }
}

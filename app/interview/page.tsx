import { redirect } from 'next/navigation';

/**
 * Closed until it is rebuilt around the job it actually has now.
 *
 * It was written to build a profile from nothing, which is why it runs to
 * twenty-five turns — and at that length it is a wall in front of somebody who
 * has not seen a resume yet. The job it should do is the opposite: take a
 * resume that already exists and ask the few questions that would make it
 * better. That is a different conversation, a different length, and different
 * wiring, so the door is shut rather than left open on the old one.
 *
 * Nothing is deleted. The page is parked next to this file as
 * page.disabled.tsx, the API routes under /api/interview still stand, and the
 * engine, prompt, coverage and compose modules are untouched and still tested.
 * Turning it back on means restoring that file.
 */
export default function InterviewPage() {
  redirect('/setup');
}

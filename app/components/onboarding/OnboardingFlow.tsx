'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveContactDetails, saveOnboardingGoal } from '../../server/actions';
import { fileToBase64 } from '../../lib/fileToBase64';
import type { ResumeStructure } from '../../lib/types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
}

/**
 * The one thing a resume cannot be finished without.
 *
 * A form rather than a conversation on purpose: contact details are structured,
 * and asking for a phone number in prose is worse for everyone. Name and email
 * arrive already filled from the account, so most people confirm rather than
 * type — which is what keeps a third step from feeling like a third step.
 */
function ContactStep({
  contact,
  onChange,
  onBack,
  onContinue,
  pending,
}: {
  contact: Contact;
  onChange: (key: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const fields: { key: keyof Contact; label: string; placeholder: string; optional?: boolean }[] = [
    { key: 'name', label: 'Name', placeholder: 'Alex Ndubuisi' },
    { key: 'email', label: 'Email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '(416) 555-0134', optional: true },
    { key: 'location', label: 'Location', placeholder: 'Toronto, ON', optional: true },
    { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/you', optional: true },
    { key: 'website', label: 'GitHub or portfolio', placeholder: 'github.com/you', optional: true },
  ];

  return (
    <div className="flex w-full max-w-[540px] flex-col">
      <h1 className="font-serif text-[38px] leading-[1.08] tracking-[-0.012em] sm:text-[46px]">
        How should employers <em className="text-accent">reach</em> you?
      </h1>
      <p className="mt-3.5 text-[15.5px] leading-relaxed text-ink-prose">
        This goes at the top of every resume you make. We filled in what your account already told
        us.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className={`flex flex-col gap-2 ${f.key === 'name' || f.key === 'email' ? 'sm:col-span-1' : ''}`}>
            <span className="text-[13.5px] text-ink-prose">
              {f.label}{' '}
              {f.optional ? <span className="text-ink-faint">optional</span> : null}
            </span>
            <input
              type="text"
              value={contact[f.key]}
              onChange={onChange(f.key)}
              placeholder={f.placeholder}
              className="w-full rounded border border-rule-field bg-ground-surface px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-ink-ghost focus:border-accent"
            />
          </label>
        ))}
      </div>

      <div className="mt-9 flex items-center justify-between border-t border-rule pt-[26px]">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="py-3 text-[14.5px] text-ink-muted transition hover:text-ink disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={pending}
          className="rounded bg-accent px-8 py-3.5 text-[15px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

const STAGES = [
  { id: 'internship', label: 'An internship or co-op', detail: 'Still studying, looking for a placement' },
  { id: 'new_grad', label: 'My first proper role', detail: 'Graduated recently, or a couple of years in' },
  { id: 'experienced', label: 'A move up or across', detail: 'Several years in, changing roles or levels' },
];

/**
 * Three steps: what you are hunting for, how to reach you, and how to build the
 * profile.
 *
 * Everything else waits for the conversation, which is better at asking. These
 * three earn their place because each changes what comes after: the goal
 * sharpens every question and every later tailoring, the contact block is the
 * one thing a resume cannot be finished without, and the last is the fork in
 * the road itself.
 */
export default function OnboardingFlow({
  initialStage,
  initialField,
  initialContact,
}: {
  initialStage: string;
  initialField: string;
  initialContact: Contact;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stage, setStage] = useState(initialStage || 'new_grad');
  const [field, setField] = useState(initialField);
  const [contact, setContact] = useState<Contact>(initialContact);
  const [pending, startTransition] = useTransition();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function continueToContact() {
    startTransition(async () => {
      await saveOnboardingGoal(stage, field);
      setStep(2);
    });
  }

  function continueToBuild() {
    startTransition(async () => {
      await saveContactDetails(contact);
      setStep(3);
    });
  }

  const setField_ = (key: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContact((c) => ({ ...c, [key]: e.target.value }));

  async function handleFile(file: File) {
    const name = file.name.toLowerCase();
    const mimeType =
      file.type === 'application/pdf' || name.endsWith('.pdf')
        ? 'application/pdf'
        : file.type === DOCX_MIME || name.endsWith('.docx')
          ? DOCX_MIME
          : null;

    if (!mimeType) {
      setError('Upload a PDF or Word (.docx) resume.');
      return;
    }

    setError(null);
    setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch('/api/profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: { base64, mimeType }, fileName: file.name }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "We couldn't read this as a resume. Try a different file.");
        return;
      }
      router.push('/setup');
    } catch {
      setError("We couldn't read that file. Make sure it isn't password protected.");
    } finally {
      setParsing(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-ground font-sans text-ink">
      <div className="flex h-[74px] items-center justify-between border-b border-rule px-6 sm:px-14">
        <div className="flex items-center gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[13px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="text-[13px] text-ink-faint">Step {step} of 3</span>
          <div className="flex gap-[5px]">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-[3px] w-[22px] rounded-sm ${step >= n ? 'bg-accent' : 'bg-rule-field'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-grow items-center justify-center px-6 py-10 sm:px-14">
        {step === 1 ? (
          <div className="flex w-full max-w-[540px] flex-col">
            <h1 className="font-serif text-[38px] leading-[1.08] tracking-[-0.012em] sm:text-[46px]">
              What are you hunting <em className="text-accent">for</em>?
            </h1>
            <p className="mt-3.5 text-[15.5px] leading-relaxed text-ink-prose">
              It changes what we ask you about, and what gets pulled forward on every resume you make.
            </p>

            <div className="mt-9 flex flex-col gap-2.5">
              {STAGES.map((option) => {
                const selected = stage === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setStage(option.id)}
                    className={`flex items-center justify-between gap-3.5 rounded-md border px-5 py-[18px] text-left transition ${
                      selected ? 'border-accent bg-accent-tint' : 'border-rule bg-ground-surface hover:border-rule-field'
                    }`}
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-[15.5px] text-ink">{option.label}</span>
                      <span className="text-[13.5px] leading-snug text-ink-muted">{option.detail}</span>
                    </span>
                    {selected ? (
                      <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-accent">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <label className="mt-8 flex flex-col gap-2.5">
              <span className="text-[13.5px] text-ink-prose">
                Doing what? <span className="text-ink-faint">optional</span>
              </span>
              <input
                type="text"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="backend engineering, data science, product design…"
                className="w-full rounded border border-rule-field bg-ground-surface px-4 py-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink-ghost focus:border-accent"
              />
            </label>

            <div className="mt-10 flex items-center justify-between border-t border-rule pt-[26px]">
              <span className="text-[13.5px] text-ink-faint">You can change this later</span>
              <button
                type="button"
                onClick={continueToContact}
                disabled={pending}
                className="rounded bg-accent px-8 py-3.5 text-[15px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-[620px] flex-col">
            <h1 className="font-serif text-[38px] leading-[1.08] tracking-[-0.012em] sm:text-[46px]">
              Now let&rsquo;s get what you&rsquo;ve <em className="text-accent">done</em>.
            </h1>
            <p className="mt-3.5 text-[15.5px] leading-relaxed text-ink-prose">
              You only do this once. Every resume after this is built from it.
            </p>

            <div className="mt-9 flex flex-col gap-3">
              <button
                type="button"
                disabled={parsing}
                onClick={() => fileInput.current?.click()}
                className="flex items-start gap-[18px] rounded-md border border-accent bg-accent-tint p-[26px] text-left transition hover:bg-accent-wash disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent-line bg-ground-surface">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M17 8l-5-5-5 5" /><path d="M12 3v13" />
                  </svg>
                </span>
                <span className="flex flex-grow flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[17px] text-ink">{parsing ? 'Reading your resume…' : 'Upload a resume'}</span>
                    <span className="rounded-[3px] bg-accent-line px-2 py-0.5 text-[11px] text-accent">about 30 seconds</span>
                  </span>
                  <span className="text-[14.5px] leading-relaxed text-ink-prose">
                    PDF or Word. We read it and pull out everything we can &mdash; you fix anything we got wrong.
                  </span>
                </span>
              </button>

              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleFile(file);
                }}
              />

              <button
                type="button"
                disabled={parsing}
                onClick={() => router.push('/setup')}
                className="flex items-start gap-[18px] rounded-md border border-rule bg-ground-surface p-[26px] text-left transition hover:border-rule-field disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-rule bg-ground-band">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#57544E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </span>
                <span className="flex flex-grow flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[17px] text-ink">Fill it in myself</span>
                    <span className="rounded-[3px] bg-ground-band px-2 py-0.5 text-[11px] text-ink-prose">about 5 minutes</span>
                  </span>
                  <span className="text-[14.5px] leading-relaxed text-ink-prose">
                    No file needed. Type in your jobs and projects and the resume builds as you go.
                  </span>
                </span>
              </button>
            </div>

            {error ? <p className="mt-4 text-sm text-flag">{error}</p> : null}

            <div className="mt-7 flex items-start gap-3 rounded-md bg-ground-band px-[18px] py-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8680" strokeWidth="1.7" strokeLinecap="round" className="mt-px shrink-0">
                <circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" />
              </svg>
              <span className="text-[13.5px] leading-relaxed text-ink-prose">
                Either way you can edit everything afterwards. When you paste in a job posting, Resumi asks
                you a few questions about that specific role &mdash; that is where the detail that makes a
                resume land gets added.
              </span>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={parsing}
                className="py-3 text-[14.5px] text-ink-muted transition hover:text-ink disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

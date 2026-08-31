'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { fileToBase64 } from '../../lib/fileToBase64';
import {
  CAREER_STAGE_LABELS,
  emptyOnboarding,
  type BaseResumeState,
  type CareerStage,
  type OnboardingState,
  type ResumeStructure,
} from '../../lib/types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * First-run flow: welcome, one question about what they're looking for, then
 * the choice of how to build their profile.
 *
 * Four steps, which is inside the range where onboarding still demonstrates
 * value without friction taking over. The goal question is the only thing asked
 * before any payoff — it is cheap to answer and it makes both the questions and
 * the later tailoring sharper, which is the trade that earns it a place here.
 *
 * Not reachable from the nav. Onboarding is something you pass through, not a
 * destination you return to.
 */
export default function OnboardingShell() {
  const router = useRouter();
  const [onboarding, setOnboarding] = useLocalStorageState<OnboardingState>('resumi-onboarding', emptyOnboarding);
  const [, setSourceStructure] = useLocalStorageState<ResumeStructure | null>('resumi-source-structure', null);
  const [, setBaseResume] = useLocalStorageState<BaseResumeState>('resumi-base-resume', {
    loaded: false, fileName: '', updatedAt: '', warning: null,
  });

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [stage, setStage] = useState<CareerStage | ''>(onboarding.stage);
  const [targetField, setTargetField] = useState(onboarding.targetField);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function saveGoal(): OnboardingState {
    const next = { ...onboarding, stage, targetField: targetField.trim() };
    setOnboarding(next);
    return next;
  }

  function finish() {
    setOnboarding({
      ...onboarding,
      stage,
      targetField: targetField.trim(),
      completed: true,
      completedAt: new Date().toISOString(),
    });
  }

  async function handleFile(file: File) {
    const mimeType =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : file.type === DOCX_MIME || file.name.toLowerCase().endsWith('.docx')
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
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'extract_resume', file: { base64, mimeType } }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message || "We couldn't read this as a resume. Try a different file.");
        return;
      }

      setSourceStructure(data.structure as ResumeStructure);
      setBaseResume({ loaded: true, fileName: file.name, updatedAt: new Date().toISOString(), warning: null });
      finish();
      // Straight to the profile so they can see what was read out of their file
      // and top up anything thin, rather than being dropped somewhere abstract.
      router.push('/profile');
    } catch {
      setError("We couldn't read that file. Make sure it isn't password protected.");
    } finally {
      setParsing(false);
    }
  }

  function startQuestions() {
    finish();
    router.push('/interview');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <p className="text-center text-sm uppercase tracking-[0.5em] text-slate-400">✦ Resumi</p>

        {step === 0 ? (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/90 p-8 text-center shadow-xl shadow-slate-950/30">
            <h1 className="text-3xl font-semibold text-white">
              A resume that changes for every job you apply to
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm text-slate-400">
              Paste in a job posting and Resumi rewrites your resume around it — keeping everything true, and
              putting the parts that matter for that role first.
            </p>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-8 w-full rounded-3xl bg-accent px-6 py-4 text-lg font-semibold text-slate-950 transition hover:bg-blue-500"
            >
              Get started
            </button>
            <p className="mt-4 text-xs text-slate-600">Takes about five minutes.</p>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/90 p-8 shadow-xl shadow-slate-950/30">
            <h1 className="text-2xl font-semibold text-white">What are you job hunting for?</h1>
            <p className="mt-2 text-sm text-slate-400">
              This shapes the questions we ask and how your resume gets tailored.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              {(Object.keys(CAREER_STAGE_LABELS) as CareerStage[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStage(key)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    stage === key
                      ? 'border-accent bg-accent/10 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {CAREER_STAGE_LABELS[key]}
                </button>
              ))}
            </div>

            <label className="mt-6 block text-sm text-slate-400">
              What kind of work? <span className="text-slate-600">(optional)</span>
              <input
                type="text"
                value={targetField}
                onChange={(event) => setTargetField(event.target.value)}
                placeholder="backend engineering, data science, product design…"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500 focus:border-slate-500"
              />
            </label>

            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!stage}
                onClick={() => { saveGoal(); setStep(2); }}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/90 p-8 shadow-xl shadow-slate-950/30">
            <h1 className="text-2xl font-semibold text-white">How should we build your profile?</h1>
            <p className="mt-2 text-sm text-slate-400">
              Either way you end up with the same thing — a profile Resumi can tailor for any job.
            </p>

            <button
              type="button"
              disabled={parsing}
              onClick={() => fileInputRef.current?.click()}
              className="mt-6 w-full rounded-3xl border border-accent bg-accent/10 px-5 py-5 text-left transition hover:bg-accent/20 disabled:opacity-60"
            >
              <span className="block font-semibold text-white">
                {parsing ? 'Reading your resume…' : 'Upload your resume'}
              </span>
              <span className="mt-1 block text-sm text-slate-400">
                PDF or Word. Fastest way in — we read it and you&rsquo;re done.
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,.docx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) handleFile(file);
              }}
            />

            <button
              type="button"
              disabled={parsing}
              onClick={startQuestions}
              className="mt-3 w-full rounded-3xl border border-slate-700 bg-slate-900 px-5 py-5 text-left transition hover:border-slate-500 disabled:opacity-60"
            >
              <span className="block font-semibold text-white">Don&rsquo;t have one? Answer a few questions</span>
              <span className="mt-1 block text-sm text-slate-400">
                We&rsquo;ll ask about your work and build the resume from your answers.
              </span>
            </button>

            {error ? <p className="mt-4 text-sm text-warning">{error}</p> : null}

            <div className="mt-8">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={parsing}
                className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-6 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-1.5 bg-slate-700'}`}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

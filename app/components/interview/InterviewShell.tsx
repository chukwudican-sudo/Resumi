'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../Header';
import Modal from '../Modal';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
// From state.ts, not engine.ts: the engine pulls in the Anthropic SDK, which
// cannot be bundled for the browser.
import { MAX_TURNS, emptyInterviewState, type InterviewState } from '../../lib/interview/state';
import { computeCoverage } from '../../lib/interview/coverage';
import {
  emptyOnboarding,
  type ApiErrorPayload,
  type BaseResumeState,
  type Fact,
  type OnboardingState,
  type ResumeStructure,
} from '../../lib/types';
import AnswerComposer from './AnswerComposer';
import ChatTranscript from './ChatTranscript';
import CoverageMeter from './CoverageMeter';
import FactChip from './FactChip';

interface TurnResponse {
  state: InterviewState;
  acknowledgement: string;
  newFacts: Fact[];
}

export default function InterviewShell() {
  const router = useRouter();
  const [state, setState] = useLocalStorageState<InterviewState>('resumi-interview', emptyInterviewState());
  const [draft, setDraft] = useLocalStorageState<string>('resumi-interview-draft', '');
  const [, setSourceStructure] = useLocalStorageState<ResumeStructure | null>('resumi-source-structure', null);
  const [, setBaseResume] = useLocalStorageState<BaseResumeState>('resumi-base-resume', {
    loaded: false, fileName: '', updatedAt: '', warning: null,
  });
  const [onboarding] = useLocalStorageState<OnboardingState>('resumi-onboarding', emptyOnboarding);

  const [thinking, setThinking] = useState(false);
  const [composing, setComposing] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState('');
  const [apiError, setApiError] = useState<ApiErrorPayload | null>(null);
  const [composeWarnings, setComposeWarnings] = useLocalStorageState<string[]>('resumi-interview-open', []);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const started = state.turns.length > 0 || state.pendingQuestion !== null;
  const coverage = useMemo(() => computeCoverage(state.entries, state.facts), [state.entries, state.facts]);

  const factsByTurn = useMemo(() => {
    const map = new Map<string, Fact[]>();
    for (const fact of state.facts) {
      if (!fact.sourceTurnId) continue;
      const list = map.get(fact.sourceTurnId);
      if (list) list.push(fact);
      else map.set(fact.sourceTurnId, [fact]);
    }
    return map;
  }, [state.facts]);

  const globalFacts = useMemo(() => state.facts.filter((f) => !f.entryId), [state.facts]);

  async function takeTurn(answer: string | null, skipped = false) {
    setThinking(true);
    setApiError(null);
    try {
      const response = await fetch('/api/interview/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          answer,
          skipped,
          goal: { stage: onboarding.stage, targetField: onboarding.targetField },
          openQuestions: composeWarnings,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setApiError(data.error ?? { type: 'generic', message: 'Something went wrong. Please try again.' });
        return;
      }
      const result = data as TurnResponse;
      setState(result.state);
      setAcknowledgement(result.acknowledgement);
      setDraft('');
    } catch {
      setApiError({ type: 'network', message: 'Your internet connection dropped. Please check your connection.' });
    } finally {
      setThinking(false);
    }
  }

  async function buildProfile() {
    setComposing(true);
    setApiError(null);
    try {
      const response = await fetch('/api/interview/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: state.entries, facts: state.facts }),
      });
      const data = await response.json();
      if (!response.ok) {
        setApiError(data.error ?? { type: 'generic', message: "We couldn't build your profile. Please try again." });
        return;
      }

      setSourceStructure(data.structure as ResumeStructure);
      setBaseResume({
        loaded: true,
        fileName: 'Built from your answers',
        updatedAt: new Date().toISOString(),
        warning: null,
      });

      if (data.warnings?.length) {
        setComposeWarnings(data.warnings);
        return;
      }
      router.push('/profile');
    } catch {
      setApiError({ type: 'network', message: 'Your internet connection dropped. Please check your connection.' });
    } finally {
      setComposing(false);
    }
  }

  /**
   * Reopens the conversation to settle the points the draft raised.
   *
   * Without this the draft is a dead end: it tells you a date looks wrong or a
   * number sounds like a target, and offers no way to say which. The questions
   * carry over so the next turn works through them first.
   */
  function resolveOpenQuestions() {
    setState({ ...state, finished: false, finishReason: '', pendingQuestion: null });
    takeTurn(null);
  }

  function restart() {
    setState(emptyInterviewState());
    setDraft('');
    setAcknowledgement('');
    setComposeWarnings([]);
  }

  // ── Not started ──────────────────────────────────────────────────────────
  if (!started) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <section className="resume-card p-8 text-center shadow-lg shadow-slate-950/10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">A few questions</p>
            <h2 className="mt-4 text-3xl font-semibold text-white">Let&rsquo;s build your profile</h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-slate-400">
              Answer a handful of questions about your work and we&rsquo;ll turn them into a resume. No document
              needed — the questions adapt to what you say, and dig for the specifics that make a resume land.
            </p>
            <p className="mt-3 text-xs text-slate-600">Usually 10&ndash;15 questions. You can stop any time.</p>
            <button
              type="button"
              onClick={() => takeTurn(null)}
              disabled={thinking}
              className="mt-8 inline-flex items-center justify-center rounded-3xl bg-accent px-8 py-4 text-lg font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {thinking ? 'Starting…' : 'Start'}
            </button>
          </section>
          {apiError ? <ErrorModal error={apiError} onClose={() => setApiError(null)} /> : null}
        </div>
      </Shell>
    );
  }

  // ── Finished ─────────────────────────────────────────────────────────────
  if (state.finished) {
    return (
      <Shell>
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="resume-card p-8 shadow-lg shadow-slate-950/10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">All done</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              {state.facts.length} things captured across {state.entries.length}{' '}
              {state.entries.length === 1 ? 'entry' : 'entries'}
            </h2>
            <p className="mt-3 text-sm text-slate-400">{state.finishReason}</p>

            {composeWarnings.length ? (
              <div className="mt-6 rounded-3xl border border-warning/30 bg-warning/10 px-5 py-4">
                <p className="text-sm font-semibold text-warning">Worth checking</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {composeWarnings.map((w) => (
                    <li key={w} className="text-sm text-warning">{w}</li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={resolveOpenQuestions}
                    disabled={thinking}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    {thinking ? 'Starting…' : `Answer ${composeWarnings.length === 1 ? 'this' : 'these'}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/profile')}
                    className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm text-slate-200 transition hover:border-slate-500"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={buildProfile}
                  disabled={composing}
                  className="rounded-3xl bg-accent px-6 py-3 font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {composing ? 'Building your profile…' : 'Build my resume profile'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestart(true)}
                  disabled={composing}
                  className="rounded-3xl border border-slate-700 bg-slate-900 px-6 py-3 text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
                >
                  Start over
                </button>
              </div>
            )}

            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">What we captured</p>
              <div className="mt-4 flex flex-col gap-5">
                {state.entries.map((entry) => {
                  const own = state.facts.filter((f) => f.entryId === entry.id);
                  return (
                    <div key={entry.id}>
                      <p className="text-sm text-white">
                        {[entry.title, entry.org].filter(Boolean).join(' at ') || `(untitled ${entry.kind})`}
                        {entry.datesDisplay ? <span className="text-slate-500"> · {entry.datesDisplay}</span> : null}
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        {own.map((f) => <FactChip key={f.id} fact={f} />)}
                      </div>
                    </div>
                  );
                })}
                {globalFacts.length ? (
                  <div>
                    <p className="text-sm text-white">About you</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {globalFacts.map((f) => <FactChip key={f.id} fact={f} />)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <CoverageMeter
              phase={state.phase}
              coverage={coverage.overall}
              turnCount={state.turns.length}
              maxTurns={MAX_TURNS}
            />
          </aside>
        </div>

        {apiError ? <ErrorModal error={apiError} onClose={() => setApiError(null)} /> : null}
        {confirmRestart ? (
          <Modal
            title="Start over?"
            message="Everything captured so far will be cleared. This cannot be undone."
            actions={[
              { label: 'Cancel', onClick: () => setConfirmRestart(false) },
              { label: 'Start over', variant: 'primary', onClick: () => { setConfirmRestart(false); restart(); } },
            ]}
          />
        ) : null}
      </Shell>
    );
  }

  // ── In progress ──────────────────────────────────────────────────────────
  const question = state.pendingQuestion;

  return (
    <Shell>
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="resume-card flex flex-col gap-6 p-6 shadow-lg shadow-slate-950/10">
          <div className="max-h-[45vh] overflow-y-auto pr-1 scrollbar-thin">
            <ChatTranscript
              turns={state.turns}
              factsByTurn={factsByTurn}
              acknowledgement={acknowledgement}
              thinking={thinking}
            />
          </div>

          {question ? (
            <div className="flex flex-col gap-4 border-t border-slate-800 pt-6">
              <div>
                <p className="text-lg text-white">{question.text}</p>
                {question.why ? <p className="mt-2 text-xs text-slate-500">{question.why}</p> : null}
              </div>
              <AnswerComposer
                question={question}
                disabled={thinking}
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={(answer) => takeTurn(answer)}
                onSkip={() => takeTurn('', true)}
                onFinish={() => setState({ ...state, finished: true, finishReason: 'You ended it here.', pendingQuestion: null })}
              />
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <CoverageMeter
            phase={state.phase}
            coverage={coverage.overall}
            turnCount={state.turns.length}
            maxTurns={MAX_TURNS}
          />
          <button
            type="button"
            onClick={() => setConfirmRestart(true)}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            Start over
          </button>
        </aside>
      </div>

      {apiError ? <ErrorModal error={apiError} onClose={() => setApiError(null)} /> : null}
      {confirmRestart ? (
        <Modal
          title="Start over?"
          message="Everything captured so far will be cleared. This cannot be undone."
          actions={[
            { label: 'Cancel', onClick: () => setConfirmRestart(false) },
            { label: 'Start over', variant: 'primary', onClick: () => { setConfirmRestart(false); restart(); } },
          ]}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-[1440px]">
        <Header
          active="interview"
          title="Tell us about your work"
          subtitle="Answer what you can — we'll build your resume profile from it."
        />
        {children}
      </div>
    </main>
  );
}

function ErrorModal({ error, onClose }: { error: ApiErrorPayload; onClose: () => void }) {
  return <Modal title="Something went wrong" message={error.message} actions={[{ label: 'Close', variant: 'primary', onClick: onClose }]} />;
}

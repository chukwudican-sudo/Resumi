'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { emptySession, ResumeStructure, SessionState } from '../lib/types';
import Modal from './Modal';
import StatusDot from './StatusDot';
import SettingsModal from './SettingsModal';
import SystemPromptModal from './SystemPromptModal';

interface HeaderProps {
  active: 'workspace' | 'review';
  title: string;
  subtitle: string;
}

export default function Header({ active, title, subtitle }: HeaderProps) {
  const router = useRouter();
  const [session, setSession] = useLocalStorageState<SessionState>('resumi-session', emptySession);
  const [, setTailoredStructure] = useLocalStorageState<ResumeStructure | null>('resumi-tailored-structure', null);
  const [userName, setUserName] = useLocalStorageState<string>('resumi_user_name', '');
  const [showSettings, setShowSettings] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);

  function handleNewSession() {
    setSession(emptySession);
    setTailoredStructure(null);
    router.push('/');
  }

  useEffect(() => {
    if (session.tailoring) {
      document.title = 'Resumi';
      return;
    }
    if (session.company || session.role) {
      const parts = [session.company, session.role].filter(Boolean).join(' ');
      document.title = `Resumi — ${parts}`;
    } else {
      document.title = 'Resumi';
    }
  }, [session.company, session.role, session.tailoring]);

  return (
    <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/90 p-6 shadow-xl shadow-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.5em] text-slate-400">✦ Resumi</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
      </div>
      <nav className="flex items-center gap-3 text-sm text-slate-400">
        {active === 'workspace' ? (
          <span className="rounded-full bg-slate-900/80 px-4 py-3 text-white">Workspace</span>
        ) : (
          <a href="/" className="rounded-full bg-slate-800 px-4 py-3 text-slate-300 hover:bg-slate-700">
            Workspace
          </a>
        )}
        {active === 'review' ? (
          <span className="rounded-full bg-slate-900/80 px-4 py-3 text-white">Review</span>
        ) : session.complete ? (
          <a href="/review" className="rounded-full bg-slate-800 px-4 py-3 text-slate-300 hover:bg-slate-700">
            Review
          </a>
        ) : (
          <span
            className="cursor-not-allowed rounded-full bg-slate-900/40 px-4 py-3 text-slate-600"
            title="Complete a tailoring session to unlock Review"
          >
            Review
          </span>
        )}

        {active === 'review' && session.complete ? (
          <button
            type="button"
            onClick={() => setShowNewSessionConfirm(true)}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-3 text-slate-300 hover:border-slate-500 hover:text-white"
          >
            New Session
          </button>
        ) : null}

        <div className="ml-1 flex items-center gap-3 border-l border-slate-800 pl-3">
          <StatusDot />
          <button
            type="button"
            onClick={() => setShowSystemPrompt(true)}
            title="How Resumi's AI works"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
          >
            ⚙
          </button>
        </div>
      </nav>

      {showSettings ? (
        <SettingsModal initialName={userName} onSave={setUserName} onClose={() => setShowSettings(false)} />
      ) : null}
      {showSystemPrompt ? <SystemPromptModal onClose={() => setShowSystemPrompt(false)} /> : null}
      {showNewSessionConfirm ? (
        <Modal
          title="Start a new session?"
          message="Your tailored resume will be cleared. Your Source Resume, About Me, and Rules will stay."
          actions={[
            { label: 'Cancel', onClick: () => setShowNewSessionConfirm(false) },
            { label: 'Start new session', variant: 'primary', onClick: () => { setShowNewSessionConfirm(false); handleNewSession(); } },
          ]}
        />
      ) : null}
    </header>
  );
}

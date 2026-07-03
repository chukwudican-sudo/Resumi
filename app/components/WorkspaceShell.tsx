'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import WorkspacePanel from './WorkspacePanel';
import BaseResumePanel from './BaseResumePanel';
import JobPostingPanel from './JobPostingPanel';
import TailorButton from './TailorButton';
import LoadingOverlay from './LoadingOverlay';
import Modal from './Modal';
import Header from './Header';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { STORAGE_WARNING_EVENT } from '../lib/storage';
import {
  ApiErrorPayload,
  BaseResumeState,
  DebugInfo,
  DocumentFileState,
  JobPostingState,
  ResumeStructure,
  SessionState,
  StructuralChange,
  emptyBaseResume,
  emptyDocumentFile,
  emptyJobPosting,
  emptySession,
} from '../lib/types';

export default function WorkspaceShell() {
  const router = useRouter();
  const [aboutMe, setAboutMe] = useLocalStorageState<DocumentFileState>('resumi-about-me', emptyDocumentFile);
  const [resumeRules, setResumeRules] = useLocalStorageState<DocumentFileState>('resumi-resume-rules', emptyDocumentFile);
  const [baseResume, setBaseResume] = useLocalStorageState<BaseResumeState>('resumi-base-resume', emptyBaseResume);
  const [sourceStructure, setSourceStructure] = useLocalStorageState<ResumeStructure | null>('resumi-source-structure', null);
  const [jobPosting, setJobPosting] = useLocalStorageState<JobPostingState>('resumi-job-posting', emptyJobPosting);
  const [, setTailoredStructure] = useLocalStorageState<ResumeStructure | null>('resumi-tailored-structure', null);
  const [, setDebugInfo] = useLocalStorageState<DebugInfo | null>('resumi-debug-info', null);
  const [session, setSession] = useLocalStorageState<SessionState>('resumi-session', emptySession);

  const [loading, setLoading] = useState(false);
  const [requestComplete, setRequestComplete] = useState(false);
  const [apiError, setApiError] = useState<ApiErrorPayload | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function handleWarning(event: Event) {
      setStorageWarning((event as CustomEvent<string>).detail);
    }
    window.addEventListener(STORAGE_WARNING_EVENT, handleWarning);
    return () => window.removeEventListener(STORAGE_WARNING_EVENT, handleWarning);
  }, []);

  // Gate on the extracted source structure, not the raw upload: tailoring reads
  // resumi-source-structure, so that's what must be present.
  const canTailor = useMemo(
    () => aboutMe.loaded && sourceStructure !== null && jobPosting.loaded,
    [aboutMe.loaded, sourceStructure, jobPosting.loaded],
  );

  async function performTailorRequest(jobSnapshot: JobPostingState) {
    if (!sourceStructure) {
      setApiError({
        type: 'generic',
        message: "We couldn't read your resume's structure yet. Re-upload your Source Resume and wait for it to finish processing.",
      });
      setSession((prev) => ({ ...prev, tailoring: false }));
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000);

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'tailor',
          aboutMe: { base64: aboutMe.base64, mimeType: aboutMe.mimeType },
          rules: { base64: resumeRules.base64, mimeType: resumeRules.mimeType },
          structure: sourceStructure,
          jobPosting: {
            company: jobSnapshot.company,
            role: jobSnapshot.role,
            description: jobSnapshot.description,
            images: jobSnapshot.images.map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
          },
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorPayload: ApiErrorPayload =
          data.error || { type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' };
        setApiError(errorPayload);
        setSession((prev) => ({ ...prev, tailoring: false }));
        return;
      }

      if (data.debugInfo) setDebugInfo(data.debugInfo);
      setTailoredStructure(data.structure || null);
      const structuralChanges: StructuralChange[] = (data.structuralChanges || []).map(
        (change: { description: string; reason: string }, index: number) => ({
          id: `${Date.now()}-${index}`,
          description: change.description,
          reason: change.reason,
          status: 'pending' as const,
        }),
      );
      setSession((prev) => ({
        ...prev,
        complete: true,
        tailoring: false,
        updating: false,
        backgroundError: null,
        company: jobSnapshot.company,
        role: jobSnapshot.role,
        jobDescription: jobSnapshot.description,
        matchScore: data.matchScore,
        missingRequirements: data.missingRequirements || [],
        estimatedPages: data.estimatedPages ?? null,
        vague: Boolean(data.vague),
        vagueReason: data.vagueReason || '',
        vagueAcknowledged: false,
        log: data.log || [],
        structuralChanges,
        usage: data.usage,
        warnings: data.warnings || [],
        resumeVersion: 1,
        resumeGeneratedAt: new Date().toISOString(),
      }));
      setJobPosting(emptyJobPosting);
      setRequestComplete(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.push('/review');
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const errorPayload: ApiErrorPayload = isTimeout
        ? { type: 'timeout', message: 'The request timed out after 3 minutes. Please try again — Claude may be under heavy load.' }
        : { type: 'network', message: 'Your internet connection dropped. Please check your connection.' };
      setApiError(errorPayload);
      setSession((prev) => ({ ...prev, tailoring: false }));
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
    }
  }

  function runTailor() {
    setApiError(null);
    const jobSnapshot = jobPosting;
    setLoading(true);
    setRequestComplete(false);
    setSession({ ...session, tailoring: true });
    performTailorRequest(jobSnapshot).finally(() => setLoading(false));
  }

  function handleCancelTailor() {
    abortControllerRef.current?.abort();
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-[1440px]">
        <Header active="workspace" title="Resume tailoring made for Alex" subtitle="Upload your documents, then tailor for any job." />

        <div className="grid gap-6 xl:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-rows-[auto_auto]">
          <WorkspacePanel
            title="About Me"
            hint="Upload a PDF about yourself — your background, skills, projects, achievements. The AI reads this every time before editing your resume."
            tooltip="Tip: Structure your PDF with clear sections — Background, Skills, Projects, Achievements — for best AI results."
            ruleNote="Stored in your browser only. Never use Resumi on shared or public computers."
            state={aboutMe}
            onUpload={setAboutMe}
          />
          <WorkspacePanel
            title="Resume Rules"
            optional
            hint="Optional. Upload a PDF of your resume rules — tone preferences, formatting rules, advice you've collected. The AI follows these on every session if provided."
            tooltip="Keep your Rules PDF under 2 pages for best performance and lower API cost."
            ruleNote="Universal rules always apply first and cannot be overridden. Your rules apply second, if uploaded."
            state={resumeRules}
            onUpload={setResumeRules}
          />
          <BaseResumePanel state={baseResume} onUpload={setBaseResume} onStructureExtracted={setSourceStructure} />
          <JobPostingPanel state={jobPosting} onChange={setJobPosting} />
        </div>

        {storageWarning ? (
          <div className="mt-6 rounded-3xl border border-warning/20 bg-warning/10 px-6 py-4 text-warning">{storageWarning}</div>
        ) : null}

        <div className="mt-10 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/90 p-6 text-center shadow-xl shadow-slate-950/30">
          <p className="text-sm text-slate-400">About Me, Base Resume, and a Job Posting are required — Resume Rules is optional.</p>
          <TailorButton loading={loading} disabled={!canTailor} onClick={runTailor} />
        </div>
      </div>

      {loading ? <LoadingOverlay hasRulesPdf={resumeRules.loaded} complete={requestComplete} onCancel={handleCancelTailor} /> : null}

      {apiError ? (
        <Modal
          title="Something went wrong"
          message={apiError.message}
          actions={[
            { label: 'Close', onClick: () => setApiError(null) },
            {
              label: 'Retry',
              variant: 'primary',
              onClick: () => {
                setApiError(null);
                runTailor();
              },
            },
          ]}
        />
      ) : null}
    </main>
  );
}

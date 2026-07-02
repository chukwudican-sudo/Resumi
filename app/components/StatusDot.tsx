'use client';

import { useEffect, useState } from 'react';

type Status = 'checking' | 'ok' | 'error';

export default function StatusDot() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/claude')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStatus(data.status === 'ok' ? 'ok' : 'error');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const color = status === 'ok' ? 'bg-success' : status === 'error' ? 'bg-red-500' : 'bg-slate-600';
  const label = status === 'ok' ? 'AI Connected' : status === 'error' ? 'AI Unavailable — check your API key' : 'Checking AI connection...';

  return (
    <span className="group relative flex items-center">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="pointer-events-none absolute right-0 top-full z-10 mt-2 hidden whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 shadow-lg group-hover:block">
        {label}
      </span>
    </span>
  );
}

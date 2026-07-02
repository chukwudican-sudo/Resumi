'use client';

import { useState } from 'react';

interface SettingsModalProps {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function SettingsModal({ initialName, onSave, onClose }: SettingsModalProps) {
  const [name, setName] = useState(initialName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <div className="mt-4">
          <label className="text-sm text-slate-400">Your Full Name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Chukwudi Alex Ndubuisi"
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500"
            autoFocus
          />
          <p className="mt-2 text-xs text-slate-500">Used to automatically name every PDF you download.</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(name.trim());
              onClose();
            }}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

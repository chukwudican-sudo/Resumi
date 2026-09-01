'use client';

import { useState, useTransition } from 'react';
import { saveContactAndRefresh } from '../../server/actions';

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
}

const FIELDS: { key: keyof Contact; label: string; placeholder: string; optional?: boolean; wide?: boolean }[] = [
  { key: 'name', label: 'Full name', placeholder: 'Alex Ndubuisi' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '(416) 555-0134', optional: true },
  { key: 'location', label: 'Location', placeholder: 'Toronto, ON', optional: true },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/you', optional: true, wide: true },
  { key: 'website', label: 'GitHub or portfolio', placeholder: 'github.com/you', optional: true, wide: true },
];

export default function ContactSection({
  contact,
  onChange,
  onSaved,
  onNext,
}: {
  contact: Contact;
  onChange: (c: Contact) => void;
  onSaved: (c: Contact) => void;
  onNext: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save(andContinue: boolean) {
    startTransition(async () => {
      await saveContactAndRefresh(contact);
      onSaved(contact);
      setSaved(true);
      if (andContinue) onNext();
    });
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">Contact</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">
        This goes at the top of every resume you make. Only a name and an email are needed &mdash;
        the rest go in if you have them.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={`flex flex-col gap-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
            <span className="text-[13.5px] text-ink-prose">
              {f.label} {f.optional ? <span className="text-ink-faint">optional</span> : null}
            </span>
            <input
              type="text"
              value={contact[f.key]}
              onChange={(e) => { setSaved(false); onChange({ ...contact, [f.key]: e.target.value }); }}
              placeholder={f.placeholder}
              className="w-full rounded border border-rule-field bg-ground-surface px-4 py-3 text-[15px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
            />
          </label>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-rule pt-6">
        <span className="text-[13px] text-ink-faint">
          {saved ? 'Saved' : 'Not saved yet'}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            className="rounded border border-rule-field px-5 py-3 text-sm text-ink-prose transition hover:border-ink-faint disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending || !contact.name.trim() || !contact.email.trim()}
            className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
          >
            {pending ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

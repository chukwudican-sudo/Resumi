'use client';

import { useState, useTransition } from 'react';
import { saveContactAndRefresh } from '../../server/actions';
import { validateContact, validateContactField, type ContactField } from '../../lib/contactValidation';

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
}

const FIELDS: { key: keyof Contact; label: string; placeholder: string; optional?: boolean; wide?: boolean; hint?: string }[] = [
  { key: 'name', label: 'Full name', placeholder: 'Alex Ndubuisi' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '(416) 555-0134' },
  {
    key: 'location',
    label: 'Location',
    placeholder: 'Toronto, ON',
    optional: true,
    hint: 'not printed on your resume — it keeps your job locations tidy',
  },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/you', optional: true, wide: true },
  { key: 'github', label: 'GitHub', placeholder: 'github.com/you', optional: true, wide: true },
  { key: 'website', label: 'Portfolio or personal site', placeholder: 'yoursite.com', optional: true, wide: true },
];

export default function ContactSection({
  contact,
  onChange,
  onSaved,
  onNext,
}: {
  contact: Contact;
  onChange: (c: Contact) => void;
  onSaved: () => void;
  onNext: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Shown only once a field has been left. Telling somebody their email is
  // wrong after they have typed one letter of it is the classic way to make a
  // form feel hostile.
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const problems = validateContact(contact as unknown as Record<ContactField, string>);
  const visible = (key: ContactField) => (touched[key] ? problems[key] : undefined);

  function save(andContinue: boolean) {
    // Everything is considered left once Save is pressed, so nothing is
    // silently holding the button disabled with no explanation on screen.
    if (Object.keys(problems).length) {
      setTouched(Object.fromEntries(FIELDS.map((f) => [f.key, true])));
      return;
    }
    startTransition(async () => {
      await saveContactAndRefresh(contact);
      onSaved();
      setSaved(true);
      if (andContinue) onNext();
    });
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">Contact</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">
        This goes at the top of every resume you make. A name and an email are the only ones
        required &mdash; but for a software role, a recruiter expects somewhere to see your work,
        so a GitHub or a portfolio is worth more here than it looks.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={`flex flex-col gap-2 ${f.wide ? 'sm:col-span-2' : ''}`}>
            <span className="text-[13.5px] text-ink-prose">
              {f.label} {f.optional ? <span className="text-ink-faint">optional</span> : null}
              {f.hint ? <span className="text-ink-faint"> &mdash; {f.hint}</span> : null}
            </span>
            <input
              type="text"
              value={contact[f.key]}
              onChange={(e) => {
                setSaved(false);
                onChange({ ...contact, [f.key]: e.target.value });
                // Once a message is on screen it clears the moment it stops
                // being true, rather than waiting for another blur.
                if (touched[f.key] && !validateContactField(f.key, e.target.value)) {
                  setTouched((t) => ({ ...t, [f.key]: false }));
                }
              }}
              onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
              placeholder={f.placeholder}
              aria-invalid={visible(f.key) ? true : undefined}
              className={`w-full rounded border bg-ground-surface px-4 py-3 text-[15px] outline-none transition placeholder:text-ink-ghost ${
                visible(f.key) ? 'border-flag focus:border-flag' : 'border-rule-field focus:border-accent'
              }`}
            />
            {visible(f.key) ? (
              <span className="text-[12.5px] leading-snug text-flag">{visible(f.key)}</span>
            ) : null}
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
            disabled={pending}
            className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
          >
            {pending ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

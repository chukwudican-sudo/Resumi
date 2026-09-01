'use client';

import { formatPlace, type PlaceParts } from '../../lib/entryFormat';

/**
 * Where something happened, in three parts.
 *
 * Split because a resume prints "Toronto, ON" domestically and adds the country
 * only across a border — a decision the rendering can make once someone has
 * given the pieces, rather than one they have to make in a text box every time.
 *
 * All three are genuinely optional. Plenty of entries have no useful place at
 * all: a side project, a remote contract, a degree where the school name says
 * everything the city would.
 */
export default function PlaceFields({
  value,
  onChange,
  label = 'Location',
}: {
  value: PlaceParts;
  onChange: (next: PlaceParts) => void;
  label?: string;
}) {
  const preview = formatPlace(value);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] text-ink-prose">
          {label} <span className="text-ink-faint">optional</span>
        </span>
        {preview ? (
          <span className="text-[12.5px] text-ink-faint">
            reads as <span className="text-ink-prose">{preview}</span>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1.2fr]">
        <Input
          value={value.city ?? ''}
          onChange={(v) => onChange({ ...value, city: v })}
          placeholder="Toronto"
          aria="City"
        />
        <Input
          value={value.region ?? ''}
          onChange={(v) => onChange({ ...value, region: v })}
          placeholder="ON"
          aria="State or province"
        />
        <Input
          value={value.country ?? ''}
          onChange={(v) => onChange({ ...value, country: v })}
          placeholder="Canada"
          aria="Country"
        />
      </div>

      <span className="text-[12px] text-ink-faint">
        City, province or state, country. Use &ldquo;Remote&rdquo; in the first box if that fits better.
      </span>
    </div>
  );
}

function Input({
  value, onChange, placeholder, aria,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  aria: string;
}) {
  return (
    <input
      type="text"
      aria-label={aria}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
    />
  );
}

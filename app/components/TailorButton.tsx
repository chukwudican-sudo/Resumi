'use client';

interface TailorButtonProps {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

export default function TailorButton({ disabled, loading, onClick }: TailorButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-3xl bg-accent px-8 py-4 text-lg font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
    >
      {loading ? 'Tailoring your resume...' : '✦ Tailor My Resume'}
    </button>
  );
}

'use client';

interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'default';
}

interface ModalProps {
  title: string;
  message: string;
  actions: ModalAction[];
}

export default function Modal({ title, message, actions }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-3 text-sm text-slate-300">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.variant === 'primary'
                  ? 'rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-500'
                  : 'rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm text-slate-200 hover:border-slate-500'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-zinc-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

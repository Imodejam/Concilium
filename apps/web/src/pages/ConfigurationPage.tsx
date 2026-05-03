import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CounselorsSection from './configuration/CounselorsSection.js';
import ProvidersSection from './configuration/ProvidersSection.js';

type Tab = 'counselors' | 'providers';

const TAB_LABELS: Record<Tab, string> = {
  counselors: 'Counselors',
  providers: 'Providers',
};

export default function ConfigurationPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'providers' ? 'providers' : 'counselors';
  const [error, setError] = useState<string | null>(null);

  function selectTab(next: Tab) {
    setParams({ tab: next }, { replace: true });
    setError(null);
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-senate-gold">Configuration</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Council counselors and providers. Everything persisted as Markdown files under <code className="text-xs">data/</code>.
        </p>
      </div>

      <div className="border-b border-zinc-800 flex gap-1">
        {(['counselors', 'providers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t
                ? 'border-senate-gold text-senate-gold'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded p-3">{error}</p>
      )}

      {tab === 'counselors' && <CounselorsSection setError={setError} />}
      {tab === 'providers' && <ProvidersSection setError={setError} />}
    </div>
  );
}

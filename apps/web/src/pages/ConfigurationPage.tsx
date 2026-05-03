import { useEffect, useState } from 'react';
import type { ProviderConfig, SenatorConfig } from '@senatum/shared';
import { api } from '../api.js';

export default function ConfigurationPage() {
  const [senators, setSenators] = useState<SenatorConfig[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listSenators(), api.listProviders()])
      .then(([s, p]) => { setSenators(s); setProviders(p); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-senate-gold">Configuration</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Senatori e provider attualmente caricati dal filesystem (`/data`). Per il MVP la modifica
          avviene a livello di file Markdown; l'editor in-app è in roadmap.
        </p>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3">Senators ({senators.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {senators.map((s) => (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-senate-gold">{s.id}</p>
                {!s.enabled && <span className="text-[10px] uppercase text-rose-400">disabled</span>}
              </div>
              <p className="text-zinc-300">{s.display_name}</p>
              <p className="text-xs text-zinc-500 mt-1">role: {s.role} · model: {s.model}</p>
              <p className="text-xs text-zinc-500">provider: {s.provider_id} · weight: {s.weight}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-3">Providers ({providers.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-senate-gold">{p.id}</p>
                {!p.enabled && <span className="text-[10px] uppercase text-rose-400">disabled</span>}
              </div>
              <p className="text-zinc-300">{p.display_name}</p>
              <p className="text-xs text-zinc-500 mt-1">kind: {p.kind} · default model: {p.default_model}</p>
              <p className="text-xs text-zinc-500">api_key_ref: <code>{p.api_key_ref}</code></p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

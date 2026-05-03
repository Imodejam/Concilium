import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DecisionOutput, DecisionValue } from '@senatum/shared';
import { api } from '../api.js';
import { DecisionBadge, RiskBadge } from '../components/badges.js';

const ALL_FILTERS: ('ALL' | DecisionValue)[] = [
  'ALL',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'REJECTED',
  'NEEDS_MORE_INFO',
];

export default function DecisionsListPage() {
  const [decisions, setDecisions] = useState<DecisionOutput[] | null>(null);
  const [filter, setFilter] = useState<'ALL' | DecisionValue>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDecisions().then(setDecisions).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!decisions) return [];
    if (filter === 'ALL') return decisions;
    return decisions.filter((d) => d.decision === filter);
  }, [decisions, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-senate-gold">Decisions</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Tutte le deliberazioni del senato, in ordine cronologico.
          </p>
        </div>
        <Link
          to="/requests/new"
          className="self-start sm:self-auto px-4 py-2 rounded-md bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 transition-colors text-center"
        >
          + New request
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-senate-gold/20 text-senate-gold border border-senate-gold/40'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error && <p className="text-rose-400 text-sm">Errore: {error}</p>}

      {decisions === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {decisions && filtered.length === 0 && (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          Nessuna decisione da mostrare. Crea la prima richiesta.
        </div>
      )}

      <ul className="space-y-3">
        {filtered.map((d) => (
          <li key={d.decision_id}>
            <Link
              to={`/decisions/${d.decision_id}`}
              className="block bg-zinc-900 border border-zinc-800 hover:border-senate-gold/40 rounded-lg p-4 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <DecisionBadge value={d.decision} />
                <RiskBadge value={d.risk_level} />
                <span className="text-xs text-zinc-500">
                  Confidence: {(d.confidence * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-zinc-500 sm:ml-auto w-full sm:w-auto">
                  {new Date(d.audit.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-zinc-200 line-clamp-2">{d.motivation}</p>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono truncate">
                request_id: {d.request_id}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

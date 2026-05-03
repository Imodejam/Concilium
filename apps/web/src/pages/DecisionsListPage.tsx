import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DecisionOutput, DecisionValue, StoredRequest } from '@concilium/shared';
import { api } from '../api.js';
import { DecisionBadge, RiskBadge } from '../components/badges.js';

const ALL_FILTERS: ('ALL' | DecisionValue)[] = [
  'ALL',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'REJECTED',
  'NEEDS_MORE_INFO',
];

const LIVE_REFRESH_MS = 4000;

export default function DecisionsListPage() {
  const [decisions, setDecisions] = useState<DecisionOutput[] | null>(null);
  const [liveRequests, setLiveRequests] = useState<StoredRequest[]>([]);
  const [filter, setFilter] = useState<'ALL' | DecisionValue>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDecisions().then(setDecisions).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const refreshLive = async () => {
      try {
        const all = await api.listRequests();
        if (cancelled) return;
        setLiveRequests(all.filter((r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS'));
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
      if (!cancelled) timer = window.setTimeout(refreshLive, LIVE_REFRESH_MS);
    };
    void refreshLive();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
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
            All council deliberations, in chronological order.
          </p>
        </div>
        <Link
          to="/requests/new"
          className="self-start sm:self-auto px-4 py-2 rounded-md bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 transition-colors text-center"
        >
          + New request
        </Link>
      </div>

      {liveRequests.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs uppercase tracking-widest text-zinc-500">Live deliberations</h2>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-zinc-500">{liveRequests.length} in progress</span>
          </div>
          <ul className="space-y-2">
            {liveRequests.map((r) => (
              <li key={r.request_id}>
                <Link
                  to={`/requests/${r.request_id}/live`}
                  className="block bg-amber-500/5 border border-amber-500/30 hover:border-amber-500/60 rounded-lg p-4 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {r.status}
                    </span>
                    <span className="text-xs text-zinc-500">{r.intent} · {r.domain}</span>
                    <span className="text-xs text-zinc-500 sm:ml-auto">
                      Submitted {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-zinc-100 font-medium line-clamp-2">{r.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500 font-mono truncate">
                    request_id: {r.request_id}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {error && <p className="text-rose-400 text-sm">Error: {error}</p>}

      {decisions === null && !error && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {decisions && filtered.length === 0 && liveRequests.length === 0 && (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          No decisions to show. Create the first request.
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

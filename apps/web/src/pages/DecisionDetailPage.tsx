import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Contribution, DecisionOutput } from '@senatum/shared';
import { api } from '../api.js';
import { DecisionBadge, RiskBadge } from '../components/badges.js';

export default function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ decision: DecisionOutput; contributions: Contribution[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getDecision(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-rose-400">Errore: {error}</p>;
  if (!data) return <p className="text-zinc-500">Caricamento…</p>;
  const { decision, contributions } = data;

  return (
    <div className="space-y-6">
      <Link to="/decisions" className="text-sm text-zinc-500 hover:text-zinc-200">
        ← Torna alle decisioni
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DecisionBadge value={decision.decision} />
          <RiskBadge value={decision.risk_level} />
          <span className="text-xs text-zinc-500">
            Confidence: {(decision.confidence * 100).toFixed(0)}%
          </span>
          {decision.requires_human_confirmation && (
            <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Human confirmation required
            </span>
          )}
        </div>
        <h1 className="font-display text-xl sm:text-2xl text-senate-gold">Princeps Senatus has spoken</h1>
        <p className="text-zinc-500 text-xs sm:text-sm font-mono break-all">
          decision_id: {decision.decision_id}
          <br />request_id: {decision.request_id}
          <br />generated: {new Date(decision.audit.created_at).toLocaleString()} ({decision.audit.duration_ms} ms)
        </p>
      </header>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Motivation</h2>
          <p className="text-zinc-100 leading-relaxed whitespace-pre-line">{decision.motivation}</p>
        </div>

        {decision.conditions.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Conditions</h2>
            <ul className="list-disc list-inside space-y-1 text-zinc-200">
              {decision.conditions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {decision.suggested_actions.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Suggested actions</h2>
            <ul className="list-disc list-inside space-y-1 text-zinc-200">
              {decision.suggested_actions.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg">
        <button
          onClick={() => setDebugOpen((v) => !v)}
          className="w-full text-left px-4 py-3 flex items-center justify-between text-sm text-zinc-400 hover:text-zinc-100"
        >
          <span>🔍 Debug — contributions from senators ({contributions.length})</span>
          <span className="text-xs">{debugOpen ? '▼' : '►'}</span>
        </button>
        {debugOpen && (
          <div className="px-4 pb-4 space-y-3">
            {contributions.map((c) => (
              <div key={c.senator_id} className="bg-zinc-950 border border-zinc-800 rounded p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-senate-gold">{c.senator_id}</span>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 uppercase tracking-wide">{c.senator_role}</span>
                  <span className="text-zinc-500">→ {c.output.recommendation}</span>
                  <span className="text-zinc-500">({(c.output.confidence * 100).toFixed(0)}%)</span>
                  <span className="text-zinc-500 sm:ml-auto">{c.duration_ms} ms</span>
                </div>
                <p className="mt-2 text-sm text-zinc-200">{c.output.summary}</p>
                {c.output.risks.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Risks</p>
                    <ul className="text-xs text-zinc-300 list-disc list-inside">
                      {c.output.risks.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs">
        <summary className="cursor-pointer text-zinc-400">Raw decision JSON</summary>
        <pre className="mt-2 overflow-x-auto text-zinc-300 whitespace-pre">{JSON.stringify(decision, null, 2)}</pre>
      </details>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AuditEvent, Contribution, StoredRequest } from '@concilium/shared';
import { api } from '../api.js';

const POLL_INTERVAL_MS = 2500;
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'NEEDS_MORE_INFO']);

interface LiveState {
  request: StoredRequest;
  contributions: Contribution[];
  audit: AuditEvent[];
}

export default function LiveDeliberationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  const poll = useCallback(async (): Promise<boolean> => {
    if (!id) return true;
    try {
      const [request, contributions, audit] = await Promise.all([
        api.getRequest(id),
        api.getRequestContributions(id),
        api.getRequestAudit(id),
      ]);
      setState({ request, contributions, audit });
      if (TERMINAL.has(request.status)) {
        if (request.status === 'COMPLETED' && request.decision_id) {
          navigate(`/decisions/${request.decision_id}`, { replace: true });
        }
        return true;
      }
    } catch (err) {
      setError((err as Error).message);
      return true;
    }
    return false;
  }, [id, navigate]);

  useEffect(() => {
    stopped.current = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped.current) return;
      const done = await poll();
      if (done || stopped.current) return;
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      stopped.current = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [poll]);

  if (error) return <p className="text-rose-400">Error: {error}</p>;
  if (!state) return <p className="text-zinc-500">Loading…</p>;

  const { request, contributions, audit } = state;
  const rounds = groupAuditByRound(audit);
  const lastPraesesPlan = [...audit].reverse().find((e) => e.kind === 'praeses.planned');

  return (
    <div className="space-y-6">
      <Link to="/decisions" className="text-sm text-zinc-500 hover:text-zinc-200">
        ← Back to decisions
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <StatusBadge status={request.status} />
          {!TERMINAL.has(request.status) && (
            <span className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              polling every {POLL_INTERVAL_MS / 1000}s
            </span>
          )}
          <span className="text-xs text-zinc-500 sm:ml-auto">{request.intent} · {request.domain}</span>
          {!TERMINAL.has(request.status) && (
            <AbortButton requestId={request.request_id} onAborted={(updated) => setState((s) => s ? { ...s, request: updated } : s)} />
          )}
        </div>
        <h1 className="font-display text-xl sm:text-2xl text-senate-gold">{request.title}</h1>
        <p className="text-zinc-500 text-xs sm:text-sm font-mono break-all">request_id: {request.request_id}</p>
        {request.aborted_at && (
          <p className="text-rose-300 text-xs">
            Aborted at {new Date(request.aborted_at).toLocaleString()}
            {request.aborted_reason && ` — ${request.aborted_reason}`}
          </p>
        )}
      </header>

      {request.context && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Context</p>
          <p className="text-sm text-zinc-300 whitespace-pre-line break-words">{request.context}</p>
        </section>
      )}

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500">Praeses Concilii</h2>
        {lastPraesesPlan ? (
          <PraesesPlanBlock event={lastPraesesPlan} />
        ) : (
          <p className="text-sm text-zinc-500">Waiting for the Praeses to plan the first round…</p>
        )}
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500">Rounds</h2>
        {rounds.length === 0 && <p className="text-sm text-zinc-500">No round started yet.</p>}
        {rounds.map((r) => (
          <RoundBlock key={r.round} round={r} contributions={contributions} />
        ))}
      </section>

      <details className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs">
        <summary className="cursor-pointer text-zinc-400">Raw audit events ({audit.length})</summary>
        <pre className="mt-2 overflow-x-auto text-zinc-300 whitespace-pre">{audit.map((e) => JSON.stringify(e)).join('\n')}</pre>
      </details>
    </div>
  );
}

interface RoundEvents {
  round: number;
  invokedIds: string[];
  respondedIds: Set<string>;
  failedIds: Set<string>;
  praesesAction?: string;
}

function groupAuditByRound(events: AuditEvent[]): RoundEvents[] {
  const map = new Map<number, RoundEvents>();
  const ensure = (round: number): RoundEvents => {
    let r = map.get(round);
    if (!r) {
      r = { round, invokedIds: [], respondedIds: new Set(), failedIds: new Set() };
      map.set(round, r);
    }
    return r;
  };
  for (const e of events) {
    const round = (e.details?.round as number | undefined) ?? 0;
    if (round === 0) continue;
    const r = ensure(round);
    if (e.kind === 'counselor.invoked' && e.counselor_id) r.invokedIds.push(e.counselor_id);
    if (e.kind === 'counselor.responded' && e.counselor_id) r.respondedIds.add(e.counselor_id);
    if (e.kind === 'counselor.failed' && e.counselor_id) r.failedIds.add(e.counselor_id);
    if (e.kind === 'praeses.planned') r.praesesAction = e.details?.action as string | undefined;
  }
  return Array.from(map.values()).sort((a, b) => a.round - b.round);
}

function AbortButton({ requestId, onAborted }: { requestId: string; onAborted: (r: StoredRequest) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function abort() {
    if (!window.confirm('Abort this deliberation? The current state will be marked as FAILED.')) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.abortRequest(requestId, 'Aborted from web dashboard');
      onAborted(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={abort}
        disabled={busy}
        className="text-xs px-2 py-0.5 rounded border border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50"
      >
        {busy ? 'Aborting…' : 'Abort'}
      </button>
      {err && <span className="text-xs text-rose-300">{err}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-zinc-800 text-zinc-300',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    FAILED: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
    NEEDS_MORE_INFO: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
  };
  const cls = styles[status] ?? 'bg-zinc-800 text-zinc-300';
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}

function PraesesPlanBlock({ event }: { event: AuditEvent }) {
  const action = event.details?.action as string | undefined;
  const rationale = event.details?.rationale as string | undefined;
  const counselors = (event.details?.counselors_to_invoke as string[] | undefined) ?? [];
  const round = event.details?.round as number | undefined;
  const actionColors: Record<string, string> = {
    INVOKE: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40',
    CONCLUDE: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
    ABORT: 'text-rose-300 bg-rose-500/10 border-rose-500/40',
  };
  const cls = actionColors[action ?? ''] ?? 'text-zinc-300 bg-zinc-800';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Round {round}</span>
        <span className={`px-2 py-0.5 rounded uppercase tracking-wide border ${cls}`}>{action}</span>
        {counselors.length > 0 && (
          <span className="text-zinc-500">→ {counselors.join(', ')}</span>
        )}
      </div>
      {rationale && <p className="text-sm text-zinc-300 italic">"{rationale}"</p>}
    </div>
  );
}

function RoundBlock({ round, contributions }: { round: RoundEvents; contributions: Contribution[] }) {
  return (
    <div className="border-l-2 border-zinc-800 pl-3 space-y-2">
      <p className="text-xs uppercase tracking-wide text-zinc-400">Round {round.round}</p>
      <ul className="space-y-2">
        {round.invokedIds.map((cid) => {
          const c = contributions.find((c) => c.counselor_id === cid);
          const responded = round.respondedIds.has(cid);
          const failed = round.failedIds.has(cid);
          return (
            <li key={cid} className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-senate-gold">{cid}</span>
                {failed ? (
                  <span className="text-rose-300 px-1.5 py-0.5 rounded bg-rose-500/10">failed</span>
                ) : responded ? (
                  <span className="text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/10">responded</span>
                ) : (
                  <span className="text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/10 inline-flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" /> thinking…
                  </span>
                )}
                {c && (
                  <span className="text-zinc-500 ml-auto">→ {c.output.recommendation} ({(c.output.confidence * 100).toFixed(0)}%)</span>
                )}
              </div>
              {c && <p className="mt-2 text-zinc-200 text-[12.5px] leading-relaxed">{c.output.summary}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

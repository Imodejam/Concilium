import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Intent } from '@concilium/shared';
import { api } from '../api.js';

const INTENTS: Intent[] = ['validate', 'decide', 'review', 'compare', 'approve', 'diagnose'];

export default function NewRequestPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [intent, setIntent] = useState<Intent>('decide');
  const [context, setContext] = useState('');
  const [payloadText, setPayloadText] = useState('{}');
  const [constraints, setConstraints] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let payload: Record<string, unknown> = {};
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch (err) {
        setError('Payload is not valid JSON: ' + (err as Error).message);
        return;
      }
    }
    setSubmitting(true);
    try {
      const stored = await api.createRequest({
        source: 'api',
        actor: { type: 'human', id: 'web-ui' },
        domain: domain || 'general',
        intent,
        title,
        context,
        payload,
        constraints: constraints.split('\n').map((s) => s.trim()).filter(Boolean),
        expected_output: {
          decision_required: true,
          allowed_decisions: ['APPROVED', 'REJECTED', 'APPROVED_WITH_CONDITIONS', 'NEEDS_MORE_INFO'],
        },
      });
      navigate(`/decisions?just_submitted=${stored.request_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-2xl sm:text-3xl text-senate-gold">New request</h1>
      <p className="text-zinc-400 text-sm">
        Submit a decision request to the council. Deliberation starts immediately; you'll see the result in the decisions list within a few seconds.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6">
        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.g. Should we adopt Postgres instead of MySQL?"
            className="input"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Domain">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="engineering, marketing, …"
              className="input"
            />
          </Field>
          <Field label="Intent">
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value as Intent)}
              className="input"
            >
              {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Context">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            placeholder="Background, constraints, current situation…"
            className="input"
          />
        </Field>

        <Field label="Payload (JSON)">
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={6}
            className="input font-mono text-sm"
            spellCheck={false}
          />
        </Field>

        <Field label="Constraints (one per line)">
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={3}
            placeholder="Max cost 5k EUR&#10;Must be reversible"
            className="input"
          />
        </Field>

        {error && <p className="text-rose-400 text-sm">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/decisions')}
            className="px-4 py-2 rounded text-zinc-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit to council'}
          </button>
        </div>
      </form>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-zinc-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

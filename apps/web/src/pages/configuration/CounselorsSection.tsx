import { useEffect, useState } from 'react';
import type { ProviderConfig, CounselorConfig } from '@concilium/shared';
import { api, type CounselorWithPrompt } from '../../api.js';
import { Field } from './formField.js';

const ROLES: CounselorConfig['role'][] = [
  'architect',
  'security',
  'product',
  'cost',
  'ux',
  'legal',
  'critic',
  'praeses',
  'synthesizer',
];

type EditState =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; original: CounselorWithPrompt };

interface Props {
  setError: (msg: string | null) => void;
}

export default function CounselorsSection({ setError }: Props) {
  const [counselors, setCounselors] = useState<CounselorWithPrompt[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [edit, setEdit] = useState<EditState>({ kind: 'closed' });

  async function refresh() {
    const [s, p] = await Promise.all([api.listCounselors(), api.listProviders()]);
    setCounselors(s);
    setProviders(p);
  }

  useEffect(() => {
    refresh().catch((e) => setError((e as Error).message));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete counselor "${id}"? This action is permanent.`)) return;
    setError(null);
    try {
      await api.deleteCounselor(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (edit.kind !== 'closed') {
    return (
      <CounselorForm
        providers={providers}
        initial={edit.kind === 'edit' ? edit.original : null}
        onCancel={() => setEdit({ kind: 'closed' })}
        onSaved={async () => {
          setEdit({ kind: 'closed' });
          await refresh();
        }}
        onError={setError}
      />
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-zinc-200">Counselors ({counselors.length})</h2>
        <button
          onClick={() => setEdit({ kind: 'new' })}
          className="px-3 py-1.5 rounded bg-senate-gold text-zinc-950 text-sm font-semibold hover:bg-senate-gold/90"
        >
          + New counselor
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {counselors.map((s) => (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-mono text-senate-gold">{s.id}</p>
              <div className="flex items-center gap-1 text-[10px] uppercase">
                {!s.enabled && <span className="text-rose-400 px-1.5 py-0.5 rounded bg-rose-500/10">disabled</span>}
                {s.role === 'praeses' && (
                  <span className="text-purple-300 px-1.5 py-0.5 rounded bg-purple-500/10">praeses</span>
                )}
                {s.role === 'synthesizer' && (
                  <span className="text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/10">synthesizer</span>
                )}
              </div>
            </div>
            <p className="text-zinc-300 mt-1">{s.display_name}</p>
            <p className="text-xs text-zinc-500 mt-1">role: {s.role} · model: <span className="font-mono">{s.model}</span></p>
            <p className="text-xs text-zinc-500">provider: {s.provider_id} · weight: {s.weight}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setEdit({ kind: 'edit', original: s })}
                className="px-3 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="px-3 py-1 rounded text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CounselorForm({ providers, initial, onCancel, onSaved, onError }: {
  providers: ProviderConfig[];
  initial: CounselorWithPrompt | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const isNew = initial === null;
  const [id, setId] = useState(initial?.id ?? '');
  const [role, setRole] = useState<CounselorConfig['role']>(initial?.role ?? 'architect');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [providerId, setProviderId] = useState(initial?.provider_id ?? (providers[0]?.id ?? ''));
  const [model, setModel] = useState(
    initial?.model
      ?? providers.find((p) => p.id === (initial?.provider_id ?? providers[0]?.id))?.default_model
      ?? 'claude-sonnet-4-6',
  );
  const [weight, setWeight] = useState(initial?.weight ?? 1);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !displayName || !systemPrompt.trim()) return;
    setSaving(true);
    onError('');
    try {
      await api.saveCounselor(
        {
          id: id.trim(),
          role,
          display_name: displayName.trim(),
          provider_id: providerId,
          model: model.trim(),
          weight,
          enabled,
        },
        systemPrompt.trim(),
      );
      await onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl text-senate-gold">
          {isNew ? 'New counselor' : `Edit ${initial.id}`}
        </h2>
        <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-zinc-100 text-sm">
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ID (unique, no spaces)">
          <input required disabled={!isNew} pattern="[a-zA-Z0-9_-]+" value={id} onChange={(e) => setId(e.target.value)}
            className="input" placeholder="e.g. legal-eu" />
        </Field>
        <Field label="Display name">
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input"
            placeholder="e.g. Legal (EU)" />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as CounselorConfig['role'])} className="input">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Provider">
          <select value={providerId}
            onChange={(e) => {
              const next = e.target.value;
              setProviderId(next);
              const p = providers.find((p) => p.id === next);
              if (p) setModel(p.default_model);
            }}
            className="input"
          >
            {providers.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </Field>
        <Field label="Model">
          <input required value={model} onChange={(e) => setModel(e.target.value)}
            className="input font-mono text-sm" placeholder="e.g. claude-sonnet-4-6" />
        </Field>
        <Field label="Weight (informational)">
          <input type="number" step="0.1" min="0" value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value) || 0)} className="input" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
        Enabled (will be included in deliberations)
      </label>

      <Field label="System prompt (Markdown)">
        <textarea required value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
          className="prompt-editor" placeholder="You are an Architect Counselor: …" spellCheck={false} />
        <p className="mt-1 text-[11px] text-zinc-500">Drag the bottom-right corner to resize. The full text becomes the LLM system prompt.</p>
      </Field>

      {role === 'praeses' && (
        <p className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded p-2">
          ⚠️ Praeses orchestrates the deliberation (chooses which counselors to invoke each round, applies policies, writes the conflict report) but does NOT take the final decision. At least one must be enabled for the council to deliberate.
        </p>
      )}
      {role === 'synthesizer' && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          ⚠️ Synthesizer counselors produce the final decision. At least one must be enabled for the council to deliberate.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded text-zinc-300 hover:text-white">Cancel</button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 disabled:opacity-50">
          {saving ? 'Saving…' : isNew ? 'Create counselor' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

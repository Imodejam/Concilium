import { useEffect, useState } from 'react';
import type { ProviderConfig, SenatorConfig } from '@senatum/shared';
import { api, type SenatorWithPrompt } from '../api.js';

const ROLES: SenatorConfig['role'][] = [
  'architect',
  'security',
  'product',
  'cost',
  'ux',
  'legal',
  'critic',
  'synthesizer',
];

type EditState =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; original: SenatorWithPrompt };

export default function ConfigurationPage() {
  const [senators, setSenators] = useState<SenatorWithPrompt[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ kind: 'closed' });

  async function refresh() {
    const [s, p] = await Promise.all([api.listSenators(), api.listProviders()]);
    setSenators(s);
    setProviders(p);
  }

  useEffect(() => {
    refresh().catch((e) => setError((e as Error).message));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm(`Eliminare il senatore "${id}"? L'azione è permanente.`)) return;
    setError(null);
    try {
      await api.deleteSenator(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-senate-gold">Configuration</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Gestisci i senatori del senato e i provider LLM. Le modifiche vengono persistite come file Markdown in <code className="text-xs">data/</code>.
        </p>
      </div>

      {error && (
        <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded p-3">{error}</p>
      )}

      {edit.kind !== 'closed' && (
        <SenatorForm
          providers={providers}
          initial={edit.kind === 'edit' ? edit.original : null}
          onCancel={() => setEdit({ kind: 'closed' })}
          onSaved={async () => {
            setEdit({ kind: 'closed' });
            await refresh();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {edit.kind === 'closed' && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-zinc-200">Senators ({senators.length})</h2>
            <button
              onClick={() => setEdit({ kind: 'new' })}
              className="px-3 py-1.5 rounded bg-senate-gold text-zinc-950 text-sm font-semibold hover:bg-senate-gold/90"
            >
              + Nuovo senatore
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {senators.map((s) => (
              <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-mono text-senate-gold">{s.id}</p>
                  <div className="flex items-center gap-1 text-[10px] uppercase">
                    {!s.enabled && <span className="text-rose-400 px-1.5 py-0.5 rounded bg-rose-500/10">disabled</span>}
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
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="px-3 py-1 rounded text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {edit.kind === 'closed' && (
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
          <p className="text-xs text-zinc-500 mt-3">
            La gestione dei provider avviene per ora via file Markdown in <code>data/providers/</code>. UI in roadmap.
          </p>
        </section>
      )}
    </div>
  );
}

interface SenatorFormProps {
  providers: ProviderConfig[];
  initial: SenatorWithPrompt | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}

function SenatorForm({ providers, initial, onCancel, onSaved, onError }: SenatorFormProps) {
  const isNew = initial === null;
  const [id, setId] = useState(initial?.id ?? '');
  const [role, setRole] = useState<SenatorConfig['role']>(initial?.role ?? 'architect');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [providerId, setProviderId] = useState(
    initial?.provider_id ?? (providers[0]?.id ?? ''),
  );
  const [model, setModel] = useState(
    initial?.model ?? providers.find((p) => p.id === (initial?.provider_id ?? providers[0]?.id))?.default_model ?? 'claude-sonnet-4-6',
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
      await api.saveSenator(
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
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6 space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl text-senate-gold">
          {isNew ? 'Nuovo senatore' : `Modifica ${initial.id}`}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-zinc-400 hover:text-zinc-100 text-sm"
        >
          ← Indietro
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ID (univoco, no spazi)">
          <input
            required
            disabled={!isNew}
            pattern="[a-zA-Z0-9_-]+"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="input"
            placeholder="es. legal-eu"
          />
        </Field>
        <Field label="Display name">
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
            placeholder="es. Legal (EU)"
          />
        </Field>
        <Field label="Ruolo">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as SenatorConfig['role'])}
            className="input"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Provider">
          <select
            value={providerId}
            onChange={(e) => {
              const next = e.target.value;
              setProviderId(next);
              const p = providers.find((p) => p.id === next);
              if (p) setModel(p.default_model);
            }}
            className="input"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Model">
          <input
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="input font-mono text-sm"
            placeholder="es. claude-sonnet-4-6"
          />
        </Field>
        <Field label="Weight (informativo)">
          <input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
            className="input"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded"
        />
        Abilitato (verrà incluso nelle deliberazioni)
      </label>

      <Field label="System prompt (Markdown)">
        <textarea
          required
          rows={10}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="input font-mono text-sm"
          placeholder="Sei un Architect Senator: …"
          spellCheck={false}
        />
      </Field>

      {role === 'synthesizer' && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
          ⚠️ I senatori col ruolo Synthesizer producono la decisione finale. Ne serve almeno uno abilitato perché il senato possa deliberare.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded text-zinc-300 hover:text-white"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 disabled:opacity-50"
        >
          {saving ? 'Salvataggio…' : isNew ? 'Crea senatore' : 'Salva modifiche'}
        </button>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: rgb(9 9 11);
          border: 1px solid rgb(39 39 42);
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          color: rgb(244 244 245);
        }
        .input:focus { outline: none; border-color: #c9a55a; }
        .input:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </form>
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

import { useEffect, useState } from 'react';
import type { ProviderConfig } from '@senatum/shared';
import { api } from '../../api.js';
import { Field } from './formField.js';

const KINDS: ProviderConfig['kind'][] = ['anthropic', 'openai', 'claude-code', 'openai-codex'];

const KIND_LABELS: Record<ProviderConfig['kind'], string> = {
  anthropic: 'anthropic — HTTP API',
  openai: 'openai — HTTP API',
  'claude-code': 'claude-code — local CLI (subscription)',
  'openai-codex': 'openai-codex — local CLI (subscription)',
};

const DEFAULT_MODELS: Record<ProviderConfig['kind'], string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  'claude-code': 'claude-code',
  'openai-codex': 'codex',
};

const DEFAULT_KEY_REFS: Record<ProviderConfig['kind'], string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'claude-code': '',
  'openai-codex': '',
};

const DEFAULT_COMMANDS: Record<ProviderConfig['kind'], string> = {
  anthropic: '',
  openai: '',
  'claude-code': 'claude',
  'openai-codex': 'codex',
};

function isCliKind(k: ProviderConfig['kind']): boolean {
  return k === 'claude-code' || k === 'openai-codex';
}

type EditState =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; original: ProviderConfig };

interface Props {
  setError: (msg: string | null) => void;
}

export default function ProvidersSection({ setError }: Props) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [edit, setEdit] = useState<EditState>({ kind: 'closed' });

  async function refresh() {
    const p = await api.listProviders();
    setProviders(p);
  }

  useEffect(() => {
    refresh().catch((e) => setError((e as Error).message));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm(`Eliminare il provider "${id}"? L'azione è permanente.`)) return;
    setError(null);
    try {
      await api.deleteProvider(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (edit.kind !== 'closed') {
    return (
      <ProviderForm
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
        <h2 className="text-lg font-semibold text-zinc-200">Providers ({providers.length})</h2>
        <button
          onClick={() => setEdit({ kind: 'new' })}
          className="px-3 py-1.5 rounded bg-senate-gold text-zinc-950 text-sm font-semibold hover:bg-senate-gold/90"
        >
          + Nuovo provider
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-mono text-senate-gold">{p.id}</p>
              <div className="flex items-center gap-1 text-[10px] uppercase">
                <span className="text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800">{p.kind}</span>
                {!p.enabled && <span className="text-rose-400 px-1.5 py-0.5 rounded bg-rose-500/10">disabled</span>}
              </div>
            </div>
            <p className="text-zinc-300 mt-1">{p.display_name}</p>
            <p className="text-xs text-zinc-500 mt-1">default model: <span className="font-mono">{p.default_model}</span></p>
            {!isCliKind(p.kind) && (
              <p className="text-xs text-zinc-500">api_key_ref: <code>{p.api_key_ref ?? '—'}</code></p>
            )}
            {isCliKind(p.kind) && (
              <p className="text-xs text-zinc-500">command: <span className="font-mono">{p.command ?? DEFAULT_COMMANDS[p.kind]}</span></p>
            )}
            {p.base_url && <p className="text-xs text-zinc-500">base_url: <span className="font-mono">{p.base_url}</span></p>}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setEdit({ kind: 'edit', original: p })}
                className="px-3 py-1 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              >
                Modifica
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="px-3 py-1 rounded text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20"
              >
                Elimina
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-4">
        Le chiavi API NON vengono salvate qui: <code>api_key_ref</code> è il nome della variabile d'ambiente che il backend leggerà a runtime. Aggiungila al file <code>.env</code> e fai restart del servizio.
      </p>
    </section>
  );
}

function ProviderForm({ initial, onCancel, onSaved, onError }: {
  initial: ProviderConfig | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const isNew = initial === null;
  const [id, setId] = useState(initial?.id ?? '');
  const [kind, setKind] = useState<ProviderConfig['kind']>(initial?.kind ?? 'anthropic');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [apiKeyRef, setApiKeyRef] = useState(initial?.api_key_ref ?? DEFAULT_KEY_REFS.anthropic);
  const [defaultModel, setDefaultModel] = useState(initial?.default_model ?? DEFAULT_MODELS.anthropic);
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? '');
  const [command, setCommand] = useState(initial?.command ?? DEFAULT_COMMANDS[initial?.kind ?? 'anthropic']);
  const [extraArgs, setExtraArgs] = useState((initial?.extra_args ?? []).join(' '));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const cliKind = isCliKind(kind);

  function handleKindChange(next: ProviderConfig['kind']) {
    setKind(next);
    if (isNew) {
      setApiKeyRef(DEFAULT_KEY_REFS[next]);
      setDefaultModel(DEFAULT_MODELS[next]);
      setCommand(DEFAULT_COMMANDS[next]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !displayName || !defaultModel) return;
    if (!cliKind && (!apiKeyRef || !/^[A-Z_][A-Z0-9_]*$/.test(apiKeyRef))) {
      onError('api_key_ref deve essere un nome di variabile d\'ambiente (lettere maiuscole, cifre, underscore).');
      return;
    }
    if (cliKind && !command.trim()) {
      onError('Per i provider CLI è obbligatorio specificare il command (path al binary).');
      return;
    }
    setSaving(true);
    onError('');
    try {
      const argsArr = extraArgs.trim() ? extraArgs.trim().split(/\s+/) : [];
      const cfg: ProviderConfig = {
        id: id.trim(),
        kind,
        display_name: displayName.trim(),
        default_model: defaultModel.trim(),
        enabled,
        ...(cliKind ? {} : { api_key_ref: apiKeyRef.trim() }),
        ...(cliKind && command.trim() ? { command: command.trim() } : {}),
        ...(cliKind && argsArr.length > 0 ? { extra_args: argsArr } : {}),
        ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
      };
      await api.saveProvider(cfg);
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
          {isNew ? 'Nuovo provider' : `Modifica ${initial.id}`}
        </h2>
        <button type="button" onClick={onCancel} className="text-zinc-400 hover:text-zinc-100 text-sm">
          ← Indietro
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="ID (univoco)">
          <input required disabled={!isNew} pattern="[a-zA-Z0-9_-]+" value={id} onChange={(e) => setId(e.target.value)}
            className="input" placeholder="es. anthropic-prod" />
        </Field>
        <Field label="Display name">
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input"
            placeholder="es. Anthropic (production)" />
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(e) => handleKindChange(e.target.value as ProviderConfig['kind'])} className="input">
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Default model">
          <input required value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}
            className="input font-mono text-sm" placeholder="es. claude-sonnet-4-6" />
        </Field>
        {!cliKind && (
          <Field label="api_key_ref (env var)">
            <input required value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value.toUpperCase())}
              className="input font-mono text-sm" placeholder="es. ANTHROPIC_API_KEY" />
          </Field>
        )}
        {cliKind && (
          <Field label="Command (path al binary)">
            <input required value={command} onChange={(e) => setCommand(e.target.value)}
              className="input font-mono text-sm" placeholder="es. claude o /usr/local/bin/claude" />
          </Field>
        )}
        {cliKind && (
          <Field label="Extra args (opzionali, separati da spazio)">
            <input value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)}
              className="input font-mono text-sm" placeholder="es. --model claude-sonnet-4-6" />
          </Field>
        )}
        {!cliKind && (
          <Field label="Base URL (opzionale)">
            <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input"
              placeholder="es. https://api.anthropic.com" />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded" />
        Abilitato
      </label>

      {!cliKind && (
        <p className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded p-2">
          🔐 La chiave vera (es. <code>sk-ant-...</code>) NON va inserita qui. Imposta solo il nome dell'env var in <code>api_key_ref</code> e poi aggiungi il valore a <code>.env</code> + restart del servizio.
        </p>
      )}
      {cliKind && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2 leading-relaxed">
          ⚠️ <strong>Subscription CLI.</strong> Senatum invocherà il binary in subprocess. L'auth dipende dallo stato di login del binary sul server (es. <code>claude /login</code> già eseguito da chi avvia il backend). Verifica i Termini di servizio del provider: l'uso server-side automatico di un piano consumer (Claude Pro/Max, ChatGPT Plus) potrebbe non essere autorizzato.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded text-zinc-300 hover:text-white">Annulla</button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded bg-senate-gold text-zinc-950 font-semibold hover:bg-senate-gold/90 disabled:opacity-50">
          {saving ? 'Salvataggio…' : isNew ? 'Crea provider' : 'Salva modifiche'}
        </button>
      </div>
    </form>
  );
}

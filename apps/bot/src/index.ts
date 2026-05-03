import 'dotenv/config';
import { Telegraf } from 'telegraf';
import type {
  Contribution,
  DecisionOutput,
  DecisionValue,
  RiskLevel,
  StoredRequest,
} from '@senatum/shared';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_USERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const API_URL = (process.env.SENATUM_API_URL ?? 'http://127.0.0.1:7001').replace(/\/$/, '');
const API_TOKEN = process.env.API_TOKEN ?? '';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN missing — bot will not start');
  process.exit(0);
}

const bot = new Telegraf(TOKEN);

// Allowlist gate
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString() ?? '';
  if (ALLOWED.size > 0 && !ALLOWED.has(userId)) {
    await ctx.reply('🏛️ Senatum: utente non autorizzato.');
    return;
  }
  return next();
});

bot.start((ctx) =>
  ctx.reply(
    '🏛️ Benvenuto a Senatum.\n\n' +
      'Comandi disponibili:\n' +
      '/new <titolo> — crea una richiesta (testo libero, una riga)\n' +
      '/status — ultime 5 richieste\n' +
      '/decision <id> — visualizza decisione completa\n' +
      '/debug <id> — contributi per ogni senatore',
  ),
);

bot.command('new', async (ctx) => {
  const text = (ctx.message.text ?? '').replace(/^\/new(\s|@\w+\s)?/, '').trim();
  if (!text) {
    await ctx.reply('Usage: /new <titolo richiesta in una riga>');
    return;
  }
  try {
    const stored = await callApi<StoredRequest>('POST', '/requests', {
      source: 'telegram',
      actor: { type: 'human', id: ctx.from?.username ?? String(ctx.from?.id ?? 'unknown') },
      domain: 'general',
      intent: 'decide',
      title: text,
      context: '',
      payload: {},
      constraints: [],
      expected_output: {
        decision_required: true,
        allowed_decisions: ['APPROVED', 'REJECTED', 'APPROVED_WITH_CONDITIONS', 'NEEDS_MORE_INFO'],
      },
    });
    await ctx.reply(
      `🏛️ Richiesta inviata al senato.\nrequest_id: \`${stored.request_id}\`\n\nUsa /status per controllare l'avanzamento.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    await ctx.reply(`❌ Errore: ${(err as Error).message}`);
  }
});

bot.command('status', async (ctx) => {
  try {
    const requests = await callApi<StoredRequest[]>('GET', '/requests');
    if (requests.length === 0) {
      await ctx.reply('Nessuna richiesta ancora sottoposta.');
      return;
    }
    const lines = requests.slice(0, 5).map((r) =>
      `• \`${r.request_id.slice(0, 8)}\` — ${statusEmoji(r.status)} ${r.status} — ${r.title.slice(0, 60)}`,
    );
    await ctx.reply('🏛️ Ultime richieste:\n' + lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Errore: ${(err as Error).message}`);
  }
});

bot.command('decision', async (ctx) => {
  const id = (ctx.message.text ?? '').replace(/^\/decision(\s|@\w+\s)?/, '').trim();
  if (!id) {
    await ctx.reply('Usage: /decision <decision_id o request_id>');
    return;
  }
  try {
    const decision = await resolveDecision(id);
    if (!decision) {
      await ctx.reply('❌ Nessuna decisione trovata per questo id.');
      return;
    }
    await ctx.reply(formatDecision(decision), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Errore: ${(err as Error).message}`);
  }
});

bot.command('debug', async (ctx) => {
  const id = (ctx.message.text ?? '').replace(/^\/debug(\s|@\w+\s)?/, '').trim();
  if (!id) {
    await ctx.reply('Usage: /debug <decision_id>');
    return;
  }
  try {
    const data = await callApi<{ decision: DecisionOutput; contributions: Contribution[] } | null>(
      'GET',
      `/decisions/${id}`,
    );
    if (!data) {
      await ctx.reply('❌ Decisione non trovata.');
      return;
    }
    const lines = data.contributions.map((c) =>
      `• *${c.senator_role}* (${c.senator_id}): ${c.output.recommendation} — ${c.output.summary.slice(0, 120)}`,
    );
    await ctx.reply(`🔍 Contributi (${data.contributions.length}):\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    await ctx.reply(`❌ Errore: ${(err as Error).message}`);
  }
});

bot.launch().then(() => console.log('Senatum Telegram bot running'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ── helpers ────────────────────────────────────────────────────────────────

async function callApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function resolveDecision(id: string): Promise<DecisionOutput | null> {
  // Try as decision_id first.
  const direct = await callApi<{ decision: DecisionOutput; contributions: Contribution[] } | null>(
    'GET',
    `/decisions/${id}`,
  );
  if (direct) return direct.decision;
  // Try as request_id by listing decisions.
  const all = await callApi<DecisionOutput[]>('GET', '/decisions');
  const match = all.find((d) => d.request_id === id || d.request_id.startsWith(id) || d.decision_id.startsWith(id));
  return match ?? null;
}

function decisionEmoji(d: DecisionValue): string {
  switch (d) {
    case 'APPROVED': return '✅';
    case 'REJECTED': return '❌';
    case 'APPROVED_WITH_CONDITIONS': return '⚠️';
    case 'NEEDS_MORE_INFO': return '❓';
  }
}

function riskEmoji(r: RiskLevel): string {
  switch (r) {
    case 'LOW': return '🟢';
    case 'MEDIUM': return '🟡';
    case 'HIGH': return '🔴';
  }
}

function statusEmoji(s: string): string {
  switch (s) {
    case 'PENDING': return '⏳';
    case 'IN_PROGRESS': return '🔄';
    case 'COMPLETED': return '✅';
    case 'FAILED': return '❌';
    case 'NEEDS_MORE_INFO': return '❓';
    default: return '•';
  }
}

function formatDecision(d: DecisionOutput): string {
  const lines = [
    '🏛️ *Senatum — Decisione*',
    '',
    `${decisionEmoji(d.decision)} *Decisione:* ${d.decision.replace(/_/g, ' ')}`,
    `${riskEmoji(d.risk_level)} *Rischio:* ${d.risk_level}`,
    `*Confidenza:* ${(d.confidence * 100).toFixed(0)}%`,
    '',
    `*Motivazione:* ${d.motivation}`,
  ];
  if (d.conditions.length > 0) {
    lines.push('', '*Condizioni:*', ...d.conditions.map((c) => `• ${c}`));
  }
  if (d.suggested_actions.length > 0) {
    lines.push('', '*Azioni suggerite:*', ...d.suggested_actions.map((c) => `• ${c}`));
  }
  if (d.requires_human_confirmation) {
    lines.push('', '⚠️ Richiede conferma umana prima dell\'esecuzione.');
  }
  return lines.join('\n');
}

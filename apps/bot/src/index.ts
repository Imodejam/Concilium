import 'dotenv/config';
import { Telegraf } from 'telegraf';
import type {
  Contribution,
  DecisionOutput,
  DecisionValue,
  RiskLevel,
  StoredRequest,
} from '@concilium/shared';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_USERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const API_URL = (process.env.CONCILIUM_API_URL ?? 'http://127.0.0.1:7001').replace(/\/$/, '');
const API_TOKEN = process.env.API_TOKEN ?? '';

if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN missing — bot will not start');
  process.exit(0);
}

const bot = new Telegraf(TOKEN);

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString() ?? '';
  if (ALLOWED.size > 0 && !ALLOWED.has(userId)) {
    await ctx.reply('🏛️ Concilium: user not allowed.');
    return;
  }
  return next();
});

bot.start((ctx) =>
  ctx.reply(
    '🏛️ Welcome to Concilium.\n\n' +
      'Available commands:\n' +
      '/new <title> — create a request (free text, single line)\n' +
      '/status — last 5 requests\n' +
      '/decision <id> — show full decision\n' +
      '/debug <id> — per-counselor contributions',
  ),
);

bot.command('new', async (ctx) => {
  const text = (ctx.message.text ?? '').replace(/^\/new(\s|@\w+\s)?/, '').trim();
  if (!text) {
    await ctx.reply('Usage: /new <one-line request title>');
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
      `🏛️ Request submitted to the council.\nrequest_id: \`${stored.request_id}\`\n\nUse /status to track progress.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

bot.command('status', async (ctx) => {
  try {
    const requests = await callApi<StoredRequest[]>('GET', '/requests');
    if (requests.length === 0) {
      await ctx.reply('No requests submitted yet.');
      return;
    }
    const lines = requests.slice(0, 5).map((r) =>
      `• \`${r.request_id.slice(0, 8)}\` — ${statusEmoji(r.status)} ${r.status} — ${r.title.slice(0, 60)}`,
    );
    await ctx.reply('🏛️ Latest requests:\n' + lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

bot.command('decision', async (ctx) => {
  const id = (ctx.message.text ?? '').replace(/^\/decision(\s|@\w+\s)?/, '').trim();
  if (!id) {
    await ctx.reply('Usage: /decision <decision_id or request_id>');
    return;
  }
  try {
    const decision = await resolveDecision(id);
    if (!decision) {
      await ctx.reply('❌ No decision found for this id.');
      return;
    }
    await ctx.reply(formatDecision(decision), { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
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
      await ctx.reply('❌ Decision not found.');
      return;
    }
    const lines = data.contributions.map((c) =>
      `• *${c.counselor_role}* (${c.counselor_id}): ${c.output.recommendation} — ${c.output.summary.slice(0, 120)}`,
    );
    await ctx.reply(`🔍 Contributions (${data.contributions.length}):\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    await ctx.reply(`❌ Error: ${(err as Error).message}`);
  }
});

await bot.telegram.setMyCommands([
  { command: 'start', description: 'Welcome and command list' },
  { command: 'new', description: 'Create a new request: /new <title>' },
  { command: 'status', description: 'List the last 5 requests' },
  { command: 'decision', description: 'Show a decision: /decision <id>' },
  { command: 'debug', description: 'Per-counselor contributions: /debug <id>' },
]);

bot.launch().then(() => console.log('Concilium Telegram bot running'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

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
  const direct = await callApi<{ decision: DecisionOutput; contributions: Contribution[] } | null>(
    'GET',
    `/decisions/${id}`,
  );
  if (direct) return direct.decision;
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
    '🏛️ *Concilium — Decision*',
    '',
    `${decisionEmoji(d.decision)} *Decision:* ${d.decision.replace(/_/g, ' ')}`,
    `${riskEmoji(d.risk_level)} *Risk:* ${d.risk_level}`,
    `*Confidence:* ${(d.confidence * 100).toFixed(0)}%`,
    '',
    `*Motivation:* ${d.motivation}`,
  ];
  if (d.conditions.length > 0) {
    lines.push('', '*Conditions:*', ...d.conditions.map((c) => `• ${c}`));
  }
  if (d.suggested_actions.length > 0) {
    lines.push('', '*Suggested actions:*', ...d.suggested_actions.map((c) => `• ${c}`));
  }
  if (d.requires_human_confirmation) {
    lines.push('', '⚠️ Requires human confirmation before execution.');
  }
  return lines.join('\n');
}

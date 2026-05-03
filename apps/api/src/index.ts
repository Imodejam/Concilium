import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import {
  RequestInputSchema,
  type StoredRequest,
  SenatorConfigSchema,
  ProviderConfigSchema,
} from '@senatum/shared';
import { config } from './config.js';
import {
  saveRequest,
  loadRequest,
  listRequests,
  loadDecision,
  listDecisions,
  listSenators,
  loadSenator,
  saveSenator,
  deleteSenator,
  listProviders,
  loadProvider,
  saveProvider,
  deleteProvider,
  listContributionsForRequest,
  appendAudit,
} from './storage/repos.js';
import { runDeliberation } from './orchestrator/deliberate.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// ── Auth (simple bearer for write endpoints) ───────────────────────────────
app.addHook('preHandler', async (req, reply) => {
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (!isWrite) return;
  if (!config.apiToken) return; // no token configured → dev mode, allow
  const auth = req.headers.authorization ?? '';
  const expected = `Bearer ${config.apiToken}`;
  if (auth !== expected) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', service: 'senatum-api' }));

// ── Requests ───────────────────────────────────────────────────────────────
app.post('/requests', async (req, reply) => {
  const parsed = RequestInputSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'Invalid request payload', details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const stored: StoredRequest = {
    ...parsed.data,
    request_id: parsed.data.request_id ?? uuidv4(),
    status: 'PENDING',
    created_at: now,
    updated_at: now,
  };
  await saveRequest(stored);
  await appendAudit({
    ts: now,
    kind: 'request.received',
    request_id: stored.request_id,
    details: { source: stored.source, intent: stored.intent, title: stored.title },
  });

  // Fire-and-forget deliberation; status field on the request is the way
  // to poll progress (PENDING → IN_PROGRESS → COMPLETED|FAILED).
  void runDeliberation(stored).catch((err) => {
    app.log.error({ err, request_id: stored.request_id }, 'deliberation failed');
  });

  reply.code(201).send({ data: stored });
});

app.get('/requests', async () => {
  const data = await listRequests();
  return { data };
});

app.get<{ Params: { id: string } }>('/requests/:id', async (req, reply) => {
  const stored = await loadRequest(req.params.id);
  if (!stored) {
    reply.code(404).send({ error: 'Request not found' });
    return;
  }
  return { data: stored };
});

// ── Decisions ──────────────────────────────────────────────────────────────
app.get('/decisions', async () => {
  const data = await listDecisions();
  return { data };
});

app.get<{ Params: { id: string } }>('/decisions/:id', async (req, reply) => {
  const decision = await loadDecision(req.params.id);
  if (!decision) {
    reply.code(404).send({ error: 'Decision not found' });
    return;
  }
  const contributions = await listContributionsForRequest(decision.request_id);
  return { data: { decision, contributions } };
});

// ── Senators ───────────────────────────────────────────────────────────────
app.get('/senators', async () => {
  const records = await listSenators();
  return { data: records.map((r) => ({ ...r.config, systemPrompt: r.systemPrompt })) };
});

app.get<{ Params: { id: string } }>('/senators/:id', async (req, reply) => {
  const record = await loadSenator(req.params.id);
  if (!record) {
    reply.code(404).send({ error: 'Senator not found' });
    return;
  }
  return { data: { ...record.config, systemPrompt: record.systemPrompt } };
});

app.post('/senators', async (req, reply) => {
  const body = req.body as { config?: unknown; systemPrompt?: string };
  const parsed = SenatorConfigSchema.safeParse(body.config);
  if (!parsed.success || typeof body.systemPrompt !== 'string') {
    reply.code(400).send({ error: 'Invalid senator', details: parsed.success ? null : parsed.error.flatten() });
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(parsed.data.id)) {
    reply.code(400).send({ error: 'Invalid senator id (use letters/digits/_/-)' });
    return;
  }
  await saveSenator({ config: parsed.data, systemPrompt: body.systemPrompt });
  reply.code(201).send({ data: parsed.data });
});

app.delete<{ Params: { id: string } }>('/senators/:id', async (req, reply) => {
  // Refuse to delete the last enabled Synthesizer — without it the senate
  // cannot produce a final decision.
  const all = await listSenators();
  const target = all.find((s) => s.config.id === req.params.id);
  if (!target) {
    reply.code(404).send({ error: 'Senator not found' });
    return;
  }
  if (target.config.role === 'synthesizer' && target.config.enabled) {
    const otherSynthesizers = all.filter(
      (s) => s.config.role === 'synthesizer' && s.config.enabled && s.config.id !== target.config.id,
    );
    if (otherSynthesizers.length === 0) {
      reply.code(409).send({
        error: 'Refusing to delete the only enabled Synthesizer. Add another one first or disable this one.',
      });
      return;
    }
  }
  const removed = await deleteSenator(req.params.id);
  reply.code(removed ? 204 : 404).send();
});

// ── Providers ──────────────────────────────────────────────────────────────
app.get('/providers', async () => {
  const data = await listProviders();
  return { data };
});

app.get<{ Params: { id: string } }>('/providers/:id', async (req, reply) => {
  const p = await loadProvider(req.params.id);
  if (!p) {
    reply.code(404).send({ error: 'Provider not found' });
    return;
  }
  return { data: p };
});

app.post('/providers', async (req, reply) => {
  const parsed = ProviderConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: 'Invalid provider', details: parsed.error.flatten() });
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(parsed.data.id)) {
    reply.code(400).send({ error: 'Invalid provider id (use letters/digits/_/-)' });
    return;
  }
  await saveProvider(parsed.data);
  reply.code(201).send({ data: parsed.data });
});

app.delete<{ Params: { id: string } }>('/providers/:id', async (req, reply) => {
  // Refuse if any enabled senator depends on this provider — otherwise the
  // next deliberation breaks silently.
  const senators = await listSenators();
  const usedBy = senators.filter(
    (s) => s.config.enabled && s.config.provider_id === req.params.id,
  );
  if (usedBy.length > 0) {
    reply.code(409).send({
      error: `Provider is used by ${usedBy.length} enabled senator(s): ${usedBy
        .map((s) => s.config.id)
        .join(', ')}. Disable them or move to another provider first.`,
    });
    return;
  }
  const removed = await deleteProvider(req.params.id);
  reply.code(removed ? 204 : 404).send();
});

// ── Boot ───────────────────────────────────────────────────────────────────
const port = config.port;
try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`senatum-api listening on :${port} (data: ${config.dataDir})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

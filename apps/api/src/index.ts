import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import {
  RequestInputSchema,
  type StoredRequest,
  CounselorConfigSchema,
  ProviderConfigSchema,
} from '@concilium/shared';
import { config } from './config.js';
import {
  saveRequest,
  loadRequest,
  listRequests,
  loadDecision,
  listDecisions,
  listCounselors,
  loadCounselor,
  saveCounselor,
  deleteCounselor,
  listProviders,
  loadProvider,
  saveProvider,
  deleteProvider,
  listContributionsForRequest,
  listAuditEventsForRequest,
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
app.get('/health', async () => ({ status: 'ok', service: 'concilium-api' }));

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

app.get<{ Params: { id: string } }>('/requests/:id/contributions', async (req) => {
  const data = await listContributionsForRequest(req.params.id);
  return { data };
});

app.get<{ Params: { id: string } }>('/requests/:id/audit', async (req) => {
  const data = await listAuditEventsForRequest(req.params.id);
  return { data };
});

// Manually abort a deliberation that's stuck or no longer wanted.
// Marks the StoredRequest as FAILED and stamps `aborted_at`. The
// orchestrator's runDeliberation reads aborted_at at every checkpoint
// and stops without overwriting the user-driven FAILED state.
app.post<{ Params: { id: string }; Body: { reason?: string } }>(
  '/requests/:id/abort',
  async (req, reply) => {
    const stored = await loadRequest(req.params.id);
    if (!stored) {
      reply.code(404).send({ error: 'Request not found' });
      return;
    }
    if (stored.status === 'COMPLETED') {
      reply.code(409).send({ error: 'Request already completed' });
      return;
    }
    const now = new Date().toISOString();
    const reason = req.body?.reason?.slice(0, 500) ?? 'Aborted by user';
    const next: StoredRequest = {
      ...stored,
      status: 'FAILED',
      updated_at: now,
      aborted_at: now,
      aborted_reason: reason,
    };
    await saveRequest(next);
    await appendAudit({
      ts: now,
      kind: 'request.aborted',
      request_id: stored.request_id,
      details: { reason },
    });
    reply.code(200).send({ data: next });
  },
);

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
  const [contributions, request] = await Promise.all([
    listContributionsForRequest(decision.request_id),
    loadRequest(decision.request_id),
  ]);
  return { data: { decision, contributions, request } };
});

// ── Counselors ───────────────────────────────────────────────────────────────
app.get('/counselors', async () => {
  const records = await listCounselors();
  return { data: records.map((r) => ({ ...r.config, systemPrompt: r.systemPrompt })) };
});

app.get<{ Params: { id: string } }>('/counselors/:id', async (req, reply) => {
  const record = await loadCounselor(req.params.id);
  if (!record) {
    reply.code(404).send({ error: 'Counselor not found' });
    return;
  }
  return { data: { ...record.config, systemPrompt: record.systemPrompt } };
});

app.post('/counselors', async (req, reply) => {
  const body = req.body as { config?: unknown; systemPrompt?: string };
  const parsed = CounselorConfigSchema.safeParse(body.config);
  if (!parsed.success || typeof body.systemPrompt !== 'string') {
    reply.code(400).send({ error: 'Invalid counselor', details: parsed.success ? null : parsed.error.flatten() });
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(parsed.data.id)) {
    reply.code(400).send({ error: 'Invalid counselor id (use letters/digits/_/-)' });
    return;
  }
  await saveCounselor({ config: parsed.data, systemPrompt: body.systemPrompt });
  reply.code(201).send({ data: parsed.data });
});

app.delete<{ Params: { id: string } }>('/counselors/:id', async (req, reply) => {
  const all = await listCounselors();
  const target = all.find((s) => s.config.id === req.params.id);
  if (!target) {
    reply.code(404).send({ error: 'Counselor not found' });
    return;
  }
  for (const role of ['synthesizer', 'praeses'] as const) {
    if (target.config.role === role && target.config.enabled) {
      const others = all.filter(
        (s) => s.config.role === role && s.config.enabled && s.config.id !== target.config.id,
      );
      if (others.length === 0) {
        reply.code(409).send({
          error: `Refusing to delete the only enabled ${role === 'synthesizer' ? 'Synthesizer' : 'Praeses'}. Add another one first or disable this one.`,
        });
        return;
      }
    }
  }
  const removed = await deleteCounselor(req.params.id);
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
  // Refuse if any enabled counselor depends on this provider — otherwise the
  // next deliberation breaks silently.
  const counselors = await listCounselors();
  const usedBy = counselors.filter(
    (s) => s.config.enabled && s.config.provider_id === req.params.id,
  );
  if (usedBy.length > 0) {
    reply.code(409).send({
      error: `Provider is used by ${usedBy.length} enabled counselor(s): ${usedBy
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
  app.log.info(`concilium-api listening on :${port} (data: ${config.dataDir})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

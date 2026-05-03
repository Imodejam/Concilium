import path from 'node:path';
import {
  type StoredRequest,
  StoredRequestSchema,
  type DecisionOutput,
  DecisionOutputSchema,
  type SenatorConfig,
  SenatorConfigSchema,
  type ProviderConfig,
  ProviderConfigSchema,
  type Contribution,
  ContributionSchema,
  type AuditEvent,
} from '@senatum/shared';
import { paths } from './paths.js';
import { appendMd, extractJsonBlock, listMd, readMd, writeMd } from './markdown.js';

// ── Requests ───────────────────────────────────────────────────────────────

export async function saveRequest(req: StoredRequest): Promise<void> {
  const file = path.join(paths.requests, `${req.request_id}.md`);
  const body = `# Request: ${req.title}\n\n${req.context || '_(no context provided)_'}\n\n` +
    '## Payload\n\n```json\n' + JSON.stringify(req, null, 2) + '\n```\n';
  await writeMd(file, { request_id: req.request_id, status: req.status, intent: req.intent }, body);
}

export async function loadRequest(requestId: string): Promise<StoredRequest | null> {
  const file = path.join(paths.requests, `${requestId}.md`);
  const doc = await readMd(file);
  if (!doc) return null;
  const json = extractJsonBlock(doc.body);
  if (!json) return null;
  return StoredRequestSchema.parse(json);
}

export async function listRequests(): Promise<StoredRequest[]> {
  const files = await listMd(paths.requests);
  const out: StoredRequest[] = [];
  for (const f of files) {
    const doc = await readMd(f);
    if (!doc) continue;
    const json = extractJsonBlock(doc.body);
    const parsed = StoredRequestSchema.safeParse(json);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Decisions ──────────────────────────────────────────────────────────────

export async function saveDecision(decision: DecisionOutput): Promise<void> {
  const file = path.join(paths.decisions, `${decision.decision_id}.md`);
  const body =
    `# Decision: ${decision.decision}\n\n${decision.motivation}\n\n` +
    (decision.conditions.length ? `## Conditions\n\n${decision.conditions.map((c) => `- ${c}`).join('\n')}\n\n` : '') +
    (decision.suggested_actions.length ? `## Suggested actions\n\n${decision.suggested_actions.map((c) => `- ${c}`).join('\n')}\n\n` : '') +
    '## Payload\n\n```json\n' + JSON.stringify(decision, null, 2) + '\n```\n';
  await writeMd(file, {
    decision_id: decision.decision_id,
    request_id: decision.request_id,
    decision: decision.decision,
    risk_level: decision.risk_level,
    confidence: decision.confidence,
  }, body);
}

export async function loadDecision(decisionId: string): Promise<DecisionOutput | null> {
  const file = path.join(paths.decisions, `${decisionId}.md`);
  const doc = await readMd(file);
  if (!doc) return null;
  const json = extractJsonBlock(doc.body);
  if (!json) return null;
  return DecisionOutputSchema.parse(json);
}

export async function listDecisions(): Promise<DecisionOutput[]> {
  const files = await listMd(paths.decisions);
  const out: DecisionOutput[] = [];
  for (const f of files) {
    const doc = await readMd(f);
    if (!doc) continue;
    const json = extractJsonBlock(doc.body);
    const parsed = DecisionOutputSchema.safeParse(json);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => b.audit.created_at.localeCompare(a.audit.created_at));
}

// ── Senators ───────────────────────────────────────────────────────────────

export interface SenatorRecord {
  config: SenatorConfig;
  systemPrompt: string;
}

export async function listSenators(): Promise<SenatorRecord[]> {
  const files = await listMd(paths.senators);
  const out: SenatorRecord[] = [];
  for (const f of files) {
    const doc = await readMd(f);
    if (!doc) continue;
    const parsed = SenatorConfigSchema.safeParse(doc.data);
    if (parsed.success) out.push({ config: parsed.data, systemPrompt: doc.body.trim() });
  }
  return out;
}

export async function loadSenator(senatorId: string): Promise<SenatorRecord | null> {
  const all = await listSenators();
  return all.find((s) => s.config.id === senatorId) ?? null;
}

export async function saveSenator(record: SenatorRecord): Promise<void> {
  const file = path.join(paths.senators, `${record.config.id}.md`);
  await writeMd(file, record.config as unknown as Record<string, unknown>, record.systemPrompt + '\n');
}

export async function deleteSenator(senatorId: string): Promise<boolean> {
  const file = path.join(paths.senators, `${senatorId}.md`);
  try {
    await (await import('node:fs')).promises.unlink(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

// ── Providers ──────────────────────────────────────────────────────────────

export async function listProviders(): Promise<ProviderConfig[]> {
  const files = await listMd(paths.providers);
  const out: ProviderConfig[] = [];
  for (const f of files) {
    const doc = await readMd(f);
    if (!doc) continue;
    const parsed = ProviderConfigSchema.safeParse(doc.data);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function loadProvider(providerId: string): Promise<ProviderConfig | null> {
  const all = await listProviders();
  return all.find((p) => p.id === providerId) ?? null;
}

export async function saveProvider(provider: ProviderConfig): Promise<void> {
  const file = path.join(paths.providers, `${provider.id}.md`);
  const body = `# Provider: ${provider.display_name}\n\nKind: \`${provider.kind}\`. Model default: \`${provider.default_model}\`. La chiave API è risolta a runtime dalla variabile d'ambiente \`${provider.api_key_ref}\`.\n`;
  await writeMd(file, provider as unknown as Record<string, unknown>, body);
}

export async function deleteProvider(providerId: string): Promise<boolean> {
  const file = path.join(paths.providers, `${providerId}.md`);
  try {
    await (await import('node:fs')).promises.unlink(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

// ── Contributions ──────────────────────────────────────────────────────────

export async function saveContribution(c: Contribution): Promise<void> {
  const file = path.join(paths.contributions, `${c.request_id}__${c.senator_id}.md`);
  const body =
    `# ${c.senator_role.toUpperCase()} (${c.senator_id})\n\n${c.output.summary}\n\n` +
    '## Output\n\n```json\n' + JSON.stringify(c, null, 2) + '\n```\n';
  await writeMd(file, {
    request_id: c.request_id,
    senator_id: c.senator_id,
    role: c.senator_role,
    recommendation: c.output.recommendation,
  }, body);
}

export async function listContributionsForRequest(requestId: string): Promise<Contribution[]> {
  const files = await listMd(paths.contributions);
  const matching = files.filter((f) => path.basename(f).startsWith(`${requestId}__`));
  const out: Contribution[] = [];
  for (const f of matching) {
    const doc = await readMd(f);
    if (!doc) continue;
    const json = extractJsonBlock(doc.body);
    const parsed = ContributionSchema.safeParse(json);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ── Audit (append-only, one file per day) ──────────────────────────────────

export async function appendAudit(event: AuditEvent): Promise<void> {
  const date = event.ts.slice(0, 10);
  const file = path.join(paths.audit, `${date}.md`);
  const chunk = '\n```json\n' + JSON.stringify(event) + '\n```\n';
  await appendMd(file, chunk);
}

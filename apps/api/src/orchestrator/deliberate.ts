import { v4 as uuidv4 } from 'uuid';
import {
  type Contribution,
  ContributionSchema,
  type DecisionOutput,
  DecisionOutputSchema,
  SenatorOutputSchema,
  type StoredRequest,
} from '@senatum/shared';
import { config } from '../config.js';
import {
  appendAudit,
  listSenators,
  saveContribution,
  saveDecision,
  saveRequest,
  type SenatorRecord,
} from '../storage/repos.js';
import { getProvider, withRetry } from '../llm/registry.js';
import {
  SENATOR_JSON_HINT,
  SYNTHESIZER_JSON_HINT,
  SYNTHESIZER_SYSTEM_PROMPT,
  buildSenatorUserPrompt,
  buildSynthesizerUserPrompt,
} from './prompts.js';

/** Strip ```json fences (if any) and parse. */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const body = fenced ? fenced[1]! : trimmed;
  return JSON.parse(body);
}

async function callSenator(
  req: StoredRequest,
  rec: SenatorRecord,
): Promise<Contribution> {
  const start = Date.now();
  const provider = await getProvider(rec.config.provider_id);
  const result = await withRetry(
    () =>
      provider.call({
        model: rec.config.model,
        systemPrompt: rec.systemPrompt,
        userPrompt: buildSenatorUserPrompt(req),
        jsonHint: SENATOR_JSON_HINT,
        timeoutMs: config.llm.timeoutMs,
      }),
    config.llm.retries,
  );
  const parsed = SenatorOutputSchema.parse(parseJson(result.rawText));
  const contribution: Contribution = {
    request_id: req.request_id,
    senator_id: rec.config.id,
    senator_role: rec.config.role,
    model: result.modelUsed,
    output: parsed,
    created_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
  };
  // Re-validate (defensive: sometimes the parser is lenient).
  return ContributionSchema.parse(contribution);
}

export async function runDeliberation(req: StoredRequest): Promise<void> {
  const startedAt = Date.now();
  const allSenators = await listSenators();
  const synthesizer = allSenators.find(
    (s) => s.config.role === 'synthesizer' && s.config.enabled,
  );
  if (!synthesizer) {
    await markFailed(req, 'No enabled Synthesizer senator configured');
    return;
  }
  const reviewers = allSenators.filter(
    (s) => s.config.role !== 'synthesizer' && s.config.enabled,
  );
  if (reviewers.length === 0) {
    await markFailed(req, 'No reviewer senators configured');
    return;
  }

  await saveRequest({
    ...req,
    status: 'IN_PROGRESS',
    updated_at: new Date().toISOString(),
  });

  const contributions: Contribution[] = [];
  const failures: { senator_id: string; error: string }[] = [];

  await Promise.all(
    reviewers.map(async (rec) => {
      await appendAudit({
        ts: new Date().toISOString(),
        kind: 'senator.invoked',
        request_id: req.request_id,
        senator_id: rec.config.id,
        details: { role: rec.config.role, model: rec.config.model },
      });
      try {
        const contrib = await callSenator(req, rec);
        await saveContribution(contrib);
        contributions.push(contrib);
        await appendAudit({
          ts: new Date().toISOString(),
          kind: 'senator.responded',
          request_id: req.request_id,
          senator_id: rec.config.id,
          details: {
            recommendation: contrib.output.recommendation,
            risk_level: contrib.output.risk_level,
            duration_ms: contrib.duration_ms,
          },
        });
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        failures.push({ senator_id: rec.config.id, error: message });
        await appendAudit({
          ts: new Date().toISOString(),
          kind: 'senator.failed',
          request_id: req.request_id,
          senator_id: rec.config.id,
          details: { error: message },
        });
      }
    }),
  );

  if (contributions.length === 0) {
    await markFailed(
      req,
      `All senators failed: ${failures.map((f) => `${f.senator_id}=${f.error}`).join('; ')}`,
    );
    return;
  }

  // ── Synthesizer ──────────────────────────────────────────────────────────
  await appendAudit({
    ts: new Date().toISOString(),
    kind: 'synthesizer.invoked',
    request_id: req.request_id,
    senator_id: synthesizer.config.id,
    details: {
      model: synthesizer.config.model,
      contribution_count: contributions.length,
    },
  });

  let decisionOutput: DecisionOutput;
  try {
    const provider = await getProvider(synthesizer.config.provider_id);
    const result = await withRetry(
      () =>
        provider.call({
          model: synthesizer.config.model,
          systemPrompt: SYNTHESIZER_SYSTEM_PROMPT + '\n\n' + synthesizer.systemPrompt,
          userPrompt: buildSynthesizerUserPrompt(req, contributions),
          jsonHint: SYNTHESIZER_JSON_HINT,
          timeoutMs: config.llm.timeoutMs,
          maxTokens: 1500,
        }),
      config.llm.retries,
    );

    type RawDecision = {
      decision: DecisionOutput['decision'];
      motivation: string;
      confidence: number;
      risk_level: DecisionOutput['risk_level'];
      requires_human_confirmation?: boolean;
      conditions?: string[];
      suggested_actions?: string[];
    };
    const raw = parseJson(result.rawText) as RawDecision;
    const modelsUsed = Array.from(
      new Set([...contributions.map((c) => c.model), result.modelUsed]),
    );
    decisionOutput = DecisionOutputSchema.parse({
      request_id: req.request_id,
      decision_id: uuidv4(),
      status: 'COMPLETED',
      decision: raw.decision,
      motivation: raw.motivation,
      confidence: raw.confidence,
      risk_level: raw.risk_level,
      requires_human_confirmation: raw.requires_human_confirmation ?? false,
      conditions: raw.conditions ?? [],
      suggested_actions: raw.suggested_actions ?? [],
      data: {},
      audit: {
        models_used: modelsUsed,
        created_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      },
    });
  } catch (err) {
    await appendAudit({
      ts: new Date().toISOString(),
      kind: 'request.failed',
      request_id: req.request_id,
      details: { stage: 'synthesizer', error: (err as Error).message },
    });
    await markFailed(req, `Synthesizer failed: ${(err as Error).message}`);
    return;
  }

  await saveDecision(decisionOutput);
  await appendAudit({
    ts: new Date().toISOString(),
    kind: 'synthesizer.responded',
    request_id: req.request_id,
    details: {
      decision: decisionOutput.decision,
      confidence: decisionOutput.confidence,
      risk_level: decisionOutput.risk_level,
    },
  });

  const finalStatus =
    decisionOutput.decision === 'NEEDS_MORE_INFO' ? 'NEEDS_MORE_INFO' : 'COMPLETED';

  await saveRequest({
    ...req,
    status: finalStatus,
    decision_id: decisionOutput.decision_id,
    updated_at: new Date().toISOString(),
  });
  await appendAudit({
    ts: new Date().toISOString(),
    kind: 'decision.persisted',
    request_id: req.request_id,
    details: {
      decision_id: decisionOutput.decision_id,
      reviewers_succeeded: contributions.length,
      reviewers_failed: failures.length,
    },
  });
}

async function markFailed(req: StoredRequest, error: string): Promise<void> {
  await saveRequest({
    ...req,
    status: 'FAILED',
    updated_at: new Date().toISOString(),
  });
  await appendAudit({
    ts: new Date().toISOString(),
    kind: 'request.failed',
    request_id: req.request_id,
    details: { error },
  });
}

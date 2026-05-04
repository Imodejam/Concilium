import { v4 as uuidv4 } from 'uuid';
import {
  type Contribution,
  ContributionSchema,
  type DecisionOutput,
  DecisionOutputSchema,
  CounselorOutputSchema,
  type StoredRequest,
} from '@concilium/shared';
import { config } from '../config.js';
import {
  appendAudit,
  listCounselors,
  saveContribution,
  saveDecision,
  saveRequest,
  type CounselorRecord,
} from '../storage/repos.js';
import { getProvider, withRetry } from '../llm/registry.js';
import {
  COUNSELOR_JSON_HINT,
  SYNTHESIZER_JSON_HINT,
  SYNTHESIZER_SYSTEM_PROMPT,
  buildCounselorUserPrompt,
  buildSynthesizerUserPrompt,
} from './prompts.js';
import {
  PRAESES_JSON_HINT,
  PRAESES_SYSTEM_PROMPT,
  buildPraesesUserPrompt,
  parsePraesesPlan,
} from './praeses.js';

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const body = fenced ? fenced[1]! : trimmed;
  return JSON.parse(body);
}

async function callCounselor(
  req: StoredRequest,
  rec: CounselorRecord,
): Promise<Contribution> {
  const start = Date.now();
  const provider = await getProvider(rec.config.provider_id);
  const result = await withRetry(
    () =>
      provider.call({
        model: rec.config.model,
        systemPrompt: rec.systemPrompt,
        userPrompt: buildCounselorUserPrompt(req),
        jsonHint: COUNSELOR_JSON_HINT,
        timeoutMs: config.llm.timeoutMs,
        reasoningEffort: rec.config.reasoning_effort,
      }),
    config.llm.retries,
  );
  const parsed = CounselorOutputSchema.parse(parseJson(result.rawText));
  const contribution: Contribution = {
    request_id: req.request_id,
    counselor_id: rec.config.id,
    counselor_role: rec.config.role,
    model: result.modelUsed,
    output: parsed,
    created_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
  };
  return ContributionSchema.parse(contribution);
}

export async function runDeliberation(req: StoredRequest): Promise<void> {
  const startedAt = Date.now();
  const allCounselors = await listCounselors();

  const praeses = allCounselors.find((c) => c.config.role === 'praeses' && c.config.enabled);
  if (!praeses) {
    await markFailed(req, 'No enabled Praeses counselor configured');
    return;
  }
  const synthesizer = allCounselors.find((c) => c.config.role === 'synthesizer' && c.config.enabled);
  if (!synthesizer) {
    await markFailed(req, 'No enabled Synthesizer counselor configured');
    return;
  }

  const reviewers = allCounselors.filter(
    (c) => c.config.role !== 'praeses' && c.config.role !== 'synthesizer' && c.config.enabled,
  );
  if (reviewers.length === 0) {
    await markFailed(req, 'No reviewer counselors configured');
    return;
  }
  const reviewerById = new Map(reviewers.map((r) => [r.config.id, r] as const));
  const availableIds = new Set(reviewers.map((r) => r.config.id));

  await saveRequest({
    ...req,
    status: 'IN_PROGRESS',
    updated_at: new Date().toISOString(),
  });

  const contributions: Contribution[] = [];
  const failures: { counselor_id: string; error: string }[] = [];
  const maxRounds = config.deliberation.maxRounds;
  let conflictReport = '';
  let abortReason: string | null = null;

  for (let round = 1; round <= maxRounds; round++) {
    await appendAudit({
      ts: new Date().toISOString(),
      kind: 'praeses.invoked',
      request_id: req.request_id,
      counselor_id: praeses.config.id,
      details: { round, model: praeses.config.model, contribution_count: contributions.length },
    });

    let plan;
    try {
      const provider = await getProvider(praeses.config.provider_id);
      const result = await withRetry(
        () =>
          provider.call({
            model: praeses.config.model,
            systemPrompt: PRAESES_SYSTEM_PROMPT + '\n\n' + praeses.systemPrompt,
            userPrompt: buildPraesesUserPrompt({
              req,
              round,
              maxRounds,
              availableCounselors: reviewers.map((r) => r.config),
              contributions,
            }),
            jsonHint: PRAESES_JSON_HINT,
            timeoutMs: config.llm.timeoutMs,
            maxTokens: 1500,
            reasoningEffort: praeses.config.reasoning_effort,
          }),
        config.llm.retries,
      );
      plan = parsePraesesPlan(result.rawText, availableIds);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      await appendAudit({
        ts: new Date().toISOString(),
        kind: 'praeses.failed',
        request_id: req.request_id,
        counselor_id: praeses.config.id,
        details: { round, error: message },
      });
      await markFailed(req, `Praeses failed at round ${round}: ${message}`);
      return;
    }

    await appendAudit({
      ts: new Date().toISOString(),
      kind: 'praeses.planned',
      request_id: req.request_id,
      counselor_id: praeses.config.id,
      details: {
        round,
        action: plan.action,
        rationale: plan.rationale,
        counselors_to_invoke: plan.counselors_to_invoke,
      },
    });

    if (plan.action === 'ABORT') {
      abortReason = plan.abort_reason ?? plan.rationale;
      await appendAudit({
        ts: new Date().toISOString(),
        kind: 'praeses.aborted',
        request_id: req.request_id,
        counselor_id: praeses.config.id,
        details: { round, abort_reason: abortReason },
      });
      await markFailed(req, `Aborted by Praeses: ${abortReason}`);
      return;
    }

    if (plan.action === 'CONCLUDE') {
      conflictReport = plan.conflict_report ?? plan.rationale;
      await appendAudit({
        ts: new Date().toISOString(),
        kind: 'praeses.concluded',
        request_id: req.request_id,
        counselor_id: praeses.config.id,
        details: { round, conflict_report: conflictReport },
      });
      break;
    }

    // INVOKE
    const toRun = plan.counselors_to_invoke
      .map((id) => reviewerById.get(id))
      .filter((r): r is CounselorRecord => Boolean(r));
    if (toRun.length === 0) {
      // Praeses asked INVOKE but produced no valid ids — treat as CONCLUDE on existing contribs.
      conflictReport = plan.rationale + ' (Praeses returned no valid counselor ids; concluding.)';
      break;
    }

    await Promise.all(
      toRun.map(async (rec) => {
        await appendAudit({
          ts: new Date().toISOString(),
          kind: 'counselor.invoked',
          request_id: req.request_id,
          counselor_id: rec.config.id,
          details: { round, role: rec.config.role, model: rec.config.model },
        });
        try {
          const contrib = await callCounselor(req, rec);
          await saveContribution(contrib);
          contributions.push(contrib);
          await appendAudit({
            ts: new Date().toISOString(),
            kind: 'counselor.responded',
            request_id: req.request_id,
            counselor_id: rec.config.id,
            details: {
              round,
              recommendation: contrib.output.recommendation,
              risk_level: contrib.output.risk_level,
              duration_ms: contrib.duration_ms,
            },
          });
        } catch (err) {
          const message = (err as Error).message ?? String(err);
          failures.push({ counselor_id: rec.config.id, error: message });
          await appendAudit({
            ts: new Date().toISOString(),
            kind: 'counselor.failed',
            request_id: req.request_id,
            counselor_id: rec.config.id,
            details: { round, error: message },
          });
        }
      }),
    );

    if (round === maxRounds) {
      conflictReport = '(Max rounds reached without explicit CONCLUDE from Praeses.)';
    }
  }

  if (contributions.length === 0) {
    await markFailed(
      req,
      `No contributions collected: ${failures.map((f) => `${f.counselor_id}=${f.error}`).join('; ')}`,
    );
    return;
  }

  await appendAudit({
    ts: new Date().toISOString(),
    kind: 'synthesizer.invoked',
    request_id: req.request_id,
    counselor_id: synthesizer.config.id,
    details: {
      model: synthesizer.config.model,
      contribution_count: contributions.length,
      has_conflict_report: Boolean(conflictReport),
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
          userPrompt: buildSynthesizerUserPrompt(req, contributions, conflictReport),
          jsonHint: SYNTHESIZER_JSON_HINT,
          timeoutMs: config.llm.timeoutMs,
          maxTokens: 1500,
          reasoningEffort: synthesizer.config.reasoning_effort,
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
      new Set([...contributions.map((c) => c.model), result.modelUsed, praeses.config.model]),
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

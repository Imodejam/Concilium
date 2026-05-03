import { z } from 'zod';
import { DecisionValueSchema, RequestStatusSchema, RiskLevelSchema } from './request.js';

export const AuditMetaSchema = z.object({
  models_used: z.array(z.string()).default([]),
  created_at: z.string(),
  duration_ms: z.number().int().nonnegative().default(0),
});
export type AuditMeta = z.infer<typeof AuditMetaSchema>;

/**
 * Universal output shape — produced by the Synthesizer once for every
 * request. Always one decision: no ties, no per-counselor votes leak through.
 */
export const DecisionOutputSchema = z.object({
  request_id: z.string().uuid(),
  decision_id: z.string().uuid(),
  status: RequestStatusSchema,
  decision: DecisionValueSchema,
  motivation: z.string(),
  confidence: z.number().min(0).max(1),
  risk_level: RiskLevelSchema,
  requires_human_confirmation: z.boolean().default(false),
  conditions: z.array(z.string()).default([]),
  suggested_actions: z.array(z.string()).default([]),
  data: z.record(z.string(), z.unknown()).default({}),
  audit: AuditMetaSchema,
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

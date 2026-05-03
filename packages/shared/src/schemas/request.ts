import { z } from 'zod';

export const SourceSchema = z.enum(['telegram', 'api', 'mcp']);
export type Source = z.infer<typeof SourceSchema>;

export const ActorTypeSchema = z.enum(['human', 'agent']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const IntentSchema = z.enum([
  'validate',
  'decide',
  'review',
  'compare',
  'approve',
  'diagnose',
]);
export type Intent = z.infer<typeof IntentSchema>;

export const DecisionValueSchema = z.enum([
  'APPROVED',
  'REJECTED',
  'APPROVED_WITH_CONDITIONS',
  'NEEDS_MORE_INFO',
]);
export type DecisionValue = z.infer<typeof DecisionValueSchema>;

export const RequestStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'NEEDS_MORE_INFO',
]);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ActorSchema = z.object({
  type: ActorTypeSchema,
  id: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const ExpectedOutputSchema = z.object({
  decision_required: z.boolean().default(true),
  allowed_decisions: z.array(DecisionValueSchema).min(1).default([
    'APPROVED',
    'REJECTED',
    'APPROVED_WITH_CONDITIONS',
    'NEEDS_MORE_INFO',
  ]),
});
export type ExpectedOutput = z.infer<typeof ExpectedOutputSchema>;

/**
 * Universal input shape — all incoming requests (API / Telegram / MCP) are
 * normalised to this schema before being persisted and dispatched to the
 * senate.
 */
export const RequestInputSchema = z.object({
  request_id: z.string().uuid().optional(), // server-assigned if missing
  source: SourceSchema,
  actor: ActorSchema,
  domain: z.string().min(1),
  intent: IntentSchema,
  title: z.string().min(1).max(200),
  context: z.string().default(''),
  payload: z.record(z.string(), z.unknown()).default({}),
  constraints: z.array(z.string()).default([]),
  expected_output: ExpectedOutputSchema.default({
    decision_required: true,
    allowed_decisions: [
      'APPROVED',
      'REJECTED',
      'APPROVED_WITH_CONDITIONS',
      'NEEDS_MORE_INFO',
    ],
  }),
});
export type RequestInput = z.infer<typeof RequestInputSchema>;

export const StoredRequestSchema = RequestInputSchema.extend({
  request_id: z.string().uuid(),
  status: RequestStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  decision_id: z.string().uuid().optional(),
});
export type StoredRequest = z.infer<typeof StoredRequestSchema>;

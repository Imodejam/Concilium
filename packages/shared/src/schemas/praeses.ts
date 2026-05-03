import { z } from 'zod';

export const PraesesActionSchema = z.enum(['INVOKE', 'CONCLUDE', 'ABORT']);
export type PraesesAction = z.infer<typeof PraesesActionSchema>;

/**
 * Plan returned by the Praeses Concilii after each round of deliberation.
 *
 * - INVOKE: run the listed counselors next, then call back to the Praeses.
 * - CONCLUDE: enough material gathered, hand off to the Synthesizer with
 *   `conflict_report` summarising convergence/divergence among counselors.
 * - ABORT: a hard policy was violated (e.g. unmitigable HIGH-risk security
 *   flag in a previous round); persist a FAILED decision with `abort_reason`
 *   and skip the Synthesizer.
 */
export const PraesesPlanSchema = z.object({
  action: PraesesActionSchema,
  counselors_to_invoke: z.array(z.string()).default([]),
  rationale: z.string().min(1),
  conflict_report: z.string().optional(),
  abort_reason: z.string().optional(),
});
export type PraesesPlan = z.infer<typeof PraesesPlanSchema>;

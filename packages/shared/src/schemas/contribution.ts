import { z } from 'zod';
import { CounselorOutputSchema, CounselorRoleSchema } from './counselor.js';

/**
 * A counselor's contribution to a specific request, stored in
 * /data/contributions/{request_id}__{counselor_id}.md
 */
export const ContributionSchema = z.object({
  request_id: z.string().uuid(),
  counselor_id: z.string().min(1),
  counselor_role: CounselorRoleSchema,
  model: z.string().min(1),
  output: CounselorOutputSchema,
  created_at: z.string(),
  duration_ms: z.number().int().nonnegative(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

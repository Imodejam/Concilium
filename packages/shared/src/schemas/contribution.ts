import { z } from 'zod';
import { SenatorOutputSchema, SenatorRoleSchema } from './senator.js';

/**
 * A senator's contribution to a specific request, stored in
 * /data/contributions/{request_id}__{senator_id}.md
 */
export const ContributionSchema = z.object({
  request_id: z.string().uuid(),
  senator_id: z.string().min(1),
  senator_role: SenatorRoleSchema,
  model: z.string().min(1),
  output: SenatorOutputSchema,
  created_at: z.string(),
  duration_ms: z.number().int().nonnegative(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

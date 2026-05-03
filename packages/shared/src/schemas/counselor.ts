import { z } from 'zod';

export const CounselorRoleSchema = z.enum([
  'architect',
  'security',
  'product',
  'cost',
  'ux',
  'legal',
  'critic',
  'praeses',
  'synthesizer',
]);
export type CounselorRole = z.infer<typeof CounselorRoleSchema>;

/**
 * Counselor config (frontmatter of /data/counselors/{id}.md).
 * The body of the .md is the system prompt used at deliberation time.
 */
export const CounselorConfigSchema = z.object({
  id: z.string().min(1),
  role: CounselorRoleSchema,
  display_name: z.string().min(1),
  provider_id: z.string().min(1),       // refers to /data/providers/{id}.md
  model: z.string().min(1),             // e.g. "claude-sonnet-4-6"
  weight: z.number().positive().default(1.0), // informative; Synthesizer doesn't average
  enabled: z.boolean().default(true),
});
export type CounselorConfig = z.infer<typeof CounselorConfigSchema>;

/**
 * What a counselor returns once it has reviewed a request. Strict schema:
 * no chain-of-thought, just structured judgment.
 */
export const CounselorOutputSchema = z.object({
  recommendation: z.enum([
    'APPROVED',
    'REJECTED',
    'APPROVED_WITH_CONDITIONS',
    'NEEDS_MORE_INFO',
  ]),
  summary: z.string().min(1),
  risks: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  risk_level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type CounselorOutput = z.infer<typeof CounselorOutputSchema>;

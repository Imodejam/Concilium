import { z } from 'zod';

/**
 * Append-only audit event. One file per day under /data/audit/YYYY-MM-DD.md
 * with a JSON block per event.
 */
export const AuditEventSchema = z.object({
  ts: z.string(),
  kind: z.enum([
    'request.received',
    'praeses.invoked',
    'praeses.planned',
    'praeses.aborted',
    'praeses.concluded',
    'praeses.failed',
    'counselor.invoked',
    'counselor.responded',
    'counselor.failed',
    'synthesizer.invoked',
    'synthesizer.responded',
    'decision.persisted',
    'request.failed',
  ]),
  request_id: z.string().uuid().optional(),
  counselor_id: z.string().optional(),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

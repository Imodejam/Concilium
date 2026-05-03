import { z } from 'zod';

export const ProviderKindSchema = z.enum(['anthropic', 'openai']);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/**
 * Provider config — describes how to reach an LLM API.
 * NEVER store the actual key; only an env var name in `api_key_ref`.
 */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  display_name: z.string().min(1),
  api_key_ref: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'must be an ENV_VAR name'),
  default_model: z.string().min(1),
  base_url: z.string().url().optional(),
  enabled: z.boolean().default(true),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

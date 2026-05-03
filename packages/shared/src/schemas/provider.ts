import { z } from 'zod';

export const ProviderKindSchema = z.enum([
  'anthropic',     // HTTP API
  'openai',        // HTTP API
  'claude-code',   // local CLI (Anthropic Claude Code subscription)
  'openai-codex',  // local CLI (OpenAI Codex subscription)
]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/**
 * Provider config — describes how to reach an LLM.
 * NEVER store the actual key; only an env var name in `api_key_ref`.
 *
 * For HTTP-API kinds (anthropic, openai) the key in env var `api_key_ref`
 * is required.
 *
 * For CLI kinds (claude-code, openai-codex) the binary at `command` is
 * spawned as a subprocess; auth lives in the user's home (e.g. `~/.claude/`,
 * `~/.codex/`) and `api_key_ref` is optional / informational only.
 */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  kind: ProviderKindSchema,
  display_name: z.string().min(1),
  api_key_ref: z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'must be an ENV_VAR name')
    .optional(),
  default_model: z.string().min(1),
  base_url: z.string().url().optional(),
  /** Path to the CLI binary (e.g. `/usr/local/bin/claude`). Only for CLI kinds. */
  command: z.string().optional(),
  /** Extra args appended to every CLI invocation. Only for CLI kinds. */
  extra_args: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export function isCliProviderKind(kind: ProviderKind): boolean {
  return kind === 'claude-code' || kind === 'openai-codex';
}

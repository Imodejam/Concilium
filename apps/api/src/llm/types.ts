import { type ProviderConfig } from '@senatum/shared';

export interface LlmCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  /** Schema description appended to the prompt to coerce JSON output. */
  jsonHint?: string;
  /** Per-call timeout (ms). Falls back to provider default if missing. */
  timeoutMs?: number;
}

export interface LlmResult {
  rawText: string;
  modelUsed: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly kind: ProviderConfig['kind'];
  call(opts: LlmCallOptions): Promise<LlmResult>;
}

export class LlmError extends Error {
  public readonly originalCause?: unknown;
  constructor(message: string, originalCause?: unknown) {
    super(message);
    this.name = 'LlmError';
    this.originalCause = originalCause;
  }
}

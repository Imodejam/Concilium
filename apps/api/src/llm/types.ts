import { type ProviderConfig } from '@concilium/shared';

export interface LlmCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  /** Schema description appended to the prompt to coerce JSON output. */
  jsonHint?: string;
  /** Per-call timeout (ms). Falls back to provider default if missing. */
  timeoutMs?: number;
  /**
   * Provider-specific hint for reasoning depth (OpenAI gpt-5.x:
   * minimal | low | medium | high | xhigh). Adapters that don't
   * support it ignore the field.
   */
  reasoningEffort?: string;
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

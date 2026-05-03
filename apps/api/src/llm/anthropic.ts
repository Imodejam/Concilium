import Anthropic from '@anthropic-ai/sdk';
import { type ProviderConfig } from '@concilium/shared';
import { LlmError, type LlmCallOptions, type LlmProvider, type LlmResult } from './types.js';

export class AnthropicProvider implements LlmProvider {
  readonly id: string;
  readonly kind: ProviderConfig['kind'] = 'anthropic';
  private readonly client: Anthropic;

  constructor(config: ProviderConfig, apiKey: string) {
    if (!apiKey) {
      throw new LlmError(`Missing API key for provider ${config.id} (env ${config.api_key_ref})`);
    }
    this.id = config.id;
    this.client = new Anthropic({ apiKey });
  }

  async call(opts: LlmCallOptions): Promise<LlmResult> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const userMsg = opts.jsonHint
      ? `${opts.userPrompt}\n\n---\nReply EXCLUSIVELY with a valid JSON block matching this schema:\n${opts.jsonHint}\n\nNo text before or after the JSON. No chain of thought.`
      : opts.userPrompt;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await this.client.messages.create(
        {
          model: opts.model,
          max_tokens: opts.maxTokens ?? 1024,
          system: opts.systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        },
        { signal: ac.signal },
      );
      const text = (res.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text!)
        .join('\n')
        .trim();
      if (!text) throw new LlmError('Anthropic returned empty content');
      return { rawText: text, modelUsed: res.model };
    } catch (err) {
      if (ac.signal.aborted) throw new LlmError(`Anthropic call timed out after ${timeoutMs}ms`);
      throw new LlmError((err as Error).message ?? String(err), err);
    } finally {
      clearTimeout(timer);
    }
  }
}

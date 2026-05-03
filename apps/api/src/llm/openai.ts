import OpenAI from 'openai';
import { type ProviderConfig } from '@concilium/shared';
import { LlmError, type LlmCallOptions, type LlmProvider, type LlmResult } from './types.js';

export class OpenAIProvider implements LlmProvider {
  readonly id: string;
  readonly kind: ProviderConfig['kind'] = 'openai';
  private readonly client: OpenAI;

  constructor(config: ProviderConfig, apiKey: string) {
    if (!apiKey) {
      throw new LlmError(`Missing API key for provider ${config.id} (env ${config.api_key_ref})`);
    }
    this.id = config.id;
    this.client = new OpenAI({ apiKey, baseURL: config.base_url });
  }

  async call(opts: LlmCallOptions): Promise<LlmResult> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const userMsg = opts.jsonHint
      ? `${opts.userPrompt}\n\n---\nReply EXCLUSIVELY with a valid JSON object matching this schema:\n${opts.jsonHint}\n\nNo text before or after the JSON. No chain of thought.`
      : opts.userPrompt;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await this.client.chat.completions.create(
        {
          model: opts.model,
          max_tokens: opts.maxTokens ?? 1024,
          response_format: opts.jsonHint ? { type: 'json_object' } : undefined,
          messages: [
            { role: 'system', content: opts.systemPrompt },
            { role: 'user', content: userMsg },
          ],
        },
        { signal: ac.signal },
      );
      const choice = res.choices?.[0];
      const text = choice?.message?.content?.trim() ?? '';
      if (!text) throw new LlmError('OpenAI returned empty content');
      return { rawText: text, modelUsed: res.model };
    } catch (err) {
      if (ac.signal.aborted) throw new LlmError(`OpenAI call timed out after ${timeoutMs}ms`);
      throw new LlmError((err as Error).message ?? String(err), err);
    } finally {
      clearTimeout(timer);
    }
  }
}

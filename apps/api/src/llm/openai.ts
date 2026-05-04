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
      // OpenAI's reasoning models (gpt-5.x, o1, o3, ...) reject the
      // legacy `max_tokens` parameter — they require `max_completion_tokens`.
      // We detect them by either an explicit reasoning_effort hint or a
      // model id that starts with one of the known reasoning families.
      const isReasoning =
        !!opts.reasoningEffort
        || /^(o1|o3|gpt-5)/i.test(opts.model);
      const tokenCap = opts.maxTokens ?? 1024;
      const baseParams: Record<string, unknown> = {
        model: opts.model,
        response_format: opts.jsonHint ? { type: 'json_object' as const } : undefined,
        messages: [
          { role: 'system' as const, content: opts.systemPrompt },
          { role: 'user' as const, content: userMsg },
        ],
      };
      if (isReasoning) {
        baseParams.max_completion_tokens = tokenCap;
      } else {
        baseParams.max_tokens = tokenCap;
      }
      // gpt-5.x reasoning models accept a reasoning_effort parameter
      // (minimal/low/medium/high/xhigh). The current openai SDK typings
      // don't list it on the chat.completions schema yet, so we feed
      // the raw object via an `unknown` cast — unknown values bubble
      // up as a 400 from OpenAI itself.
      if (opts.reasoningEffort) {
        baseParams.reasoning_effort = opts.reasoningEffort;
      }
      const res = await this.client.chat.completions.create(
        baseParams as unknown as Parameters<typeof this.client.chat.completions.create>[0] & { stream?: false },
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

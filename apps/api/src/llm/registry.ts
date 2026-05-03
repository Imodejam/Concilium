import { type ProviderConfig, isCliProviderKind } from '@concilium/shared';
import { listProviders } from '../storage/repos.js';
import { AnthropicProvider } from './anthropic.js';
import { CliProvider } from './cli.js';
import { LlmError, type LlmProvider } from './types.js';

const cache = new Map<string, LlmProvider>();

export async function getProvider(providerId: string): Promise<LlmProvider> {
  const cached = cache.get(providerId);
  if (cached) return cached;
  const all = await listProviders();
  const found = all.find((p) => p.id === providerId && p.enabled);
  if (!found) throw new LlmError(`Provider ${providerId} not found or disabled`);
  const apiKey = found.api_key_ref ? (process.env[found.api_key_ref] ?? '') : '';
  const instance = build(found, apiKey);
  cache.set(providerId, instance);
  return instance;
}

function build(cfg: ProviderConfig, apiKey: string): LlmProvider {
  if (isCliProviderKind(cfg.kind)) {
    return new CliProvider(cfg);
  }
  switch (cfg.kind) {
    case 'anthropic':
      return new AnthropicProvider(cfg, apiKey);
    case 'openai':
      throw new LlmError('OpenAI HTTP adapter not yet implemented');
    default:
      throw new LlmError(`Unsupported provider kind: ${cfg.kind}`);
  }
}

/** Drop the cached instance (e.g. when a provider's config has changed). */
export function invalidateProvider(providerId: string): void {
  cache.delete(providerId);
}

/**
 * Wraps a single LLM call with linear retry. Re-throws after `retries` attempts.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = 500 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

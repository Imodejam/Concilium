import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: parseInt(process.env.API_PORT ?? '7001', 10),
  apiToken: process.env.API_TOKEN ?? '',
  dataDir: path.resolve(process.env.DATA_DIR ?? path.resolve(process.cwd(), '../../data')),
  llm: {
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    timeoutMs: 60_000,
    retries: 2,
  },
  deliberation: {
    maxRounds: parseInt(process.env.MAX_ROUNDS ?? '3', 10),
  },
};

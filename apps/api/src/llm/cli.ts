import { spawn } from 'node:child_process';
import { type ProviderConfig } from '@concilium/shared';
import { LlmError, type LlmCallOptions, type LlmProvider, type LlmResult } from './types.js';

/**
 * Provider that drives a local CLI binary (e.g. Claude Code, OpenAI Codex)
 * via subprocess spawn instead of an HTTP API. Auth is delegated to the
 * binary's own login state (`~/.claude/`, `~/.codex/`).
 *
 * NOTE: most consumer subscriptions (Claude Pro/Max, ChatGPT Plus/Pro) are
 * intended for personal interactive use; running them server-side is a
 * grey area for the provider's ToS. Concilium makes the integration
 * available; the operator is responsible for compliant use.
 */
export class CliProvider implements LlmProvider {
  readonly id: string;
  readonly kind: ProviderConfig['kind'];
  private readonly command: string;
  private readonly extraArgs: string[];

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.kind = config.kind;
    this.command = config.command ?? this.defaultBinary();
    this.extraArgs = config.extra_args ?? [];
  }

  async call(opts: LlmCallOptions): Promise<LlmResult> {
    const timeoutMs = opts.timeoutMs ?? 90_000;
    // Most CLIs don't accept a separate "system" prompt — fold both prompts
    // (system instructions + user request + JSON hint) into a single message
    // sent on stdin.
    const prompt = [
      opts.systemPrompt,
      opts.userPrompt,
      opts.jsonHint
        ? `\n---\nReply EXCLUSIVELY with a valid JSON block matching this schema:\n${opts.jsonHint}\n\nNo text before or after the JSON. No chain of thought.`
        : '',
    ].filter(Boolean).join('\n\n');

    const args = this.invocationArgs();
    const { stdout, stderr, exitCode } = await spawnCollect(this.command, args, prompt, timeoutMs);

    if (this.kind === 'claude-code') {
      return this.parseClaudeCode(stdout, stderr, exitCode);
    }
    // openai-codex (and any future CLI) — no documented JSON envelope yet,
    // return raw stdout. The orchestrator will then JSON.parse the model's
    // own answer using the standard fence-stripping logic.
    if (exitCode !== 0) {
      throw new LlmError(`Codex CLI exited ${exitCode}: ${stderr.slice(0, 500)}`);
    }
    if (!stdout.trim()) throw new LlmError('Codex CLI returned empty stdout');
    return { rawText: stdout.trim(), modelUsed: this.id };
  }

  private parseClaudeCode(stdout: string, stderr: string, exitCode: number): LlmResult {
    let parsed: ClaudeCodeOutput;
    try {
      parsed = JSON.parse(stdout) as ClaudeCodeOutput;
    } catch {
      throw new LlmError(
        `claude-code output is not JSON (exit ${exitCode}): ${stdout.slice(0, 300)} | stderr: ${stderr.slice(0, 200)}`,
      );
    }
    if (parsed.is_error) {
      throw new LlmError(`claude-code error: ${parsed.result ?? parsed.subtype ?? 'unknown'}`);
    }
    if (typeof parsed.result !== 'string' || parsed.result.length === 0) {
      throw new LlmError('claude-code returned no result text');
    }
    const modelUsed = parsed.modelUsage ? Object.keys(parsed.modelUsage)[0] ?? this.id : this.id;
    return { rawText: parsed.result.trim(), modelUsed };
  }

  private defaultBinary(): string {
    return this.kind === 'claude-code' ? 'claude' : 'codex';
  }

  private invocationArgs(): string[] {
    if (this.kind === 'claude-code') {
      return ['--print', '--output-format', 'json', ...this.extraArgs];
    }
    // OpenAI Codex CLI: `codex exec` reads the prompt from stdin in
    // non-interactive mode. Operator can override with extra_args.
    return ['exec', ...this.extraArgs];
  }
}

interface ClaudeCodeOutput {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  modelUsage?: Record<string, unknown>;
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function spawnCollect(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // hard kill if it doesn't exit
      setTimeout(() => child.kill('SIGKILL'), 2000);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new LlmError(`Failed to spawn ${command}: ${err.message}`, err));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new LlmError(`CLI ${command} timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    // Write the prompt to stdin and close — the CLI reads it as the user
    // message and then prints the assistant reply on stdout.
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

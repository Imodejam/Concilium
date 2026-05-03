import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export interface MarkdownDoc<TFront = Record<string, unknown>> {
  data: TFront;
  body: string;
}

/** Read .md → frontmatter + body, or null if missing. */
export async function readMd<T = Record<string, unknown>>(
  filePath: string,
): Promise<MarkdownDoc<T> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = matter(raw);
    return { data: parsed.data as T, body: parsed.content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Atomic write of a .md (frontmatter + body). Creates parent dirs. */
export async function writeMd<T extends Record<string, unknown>>(
  filePath: string,
  data: T,
  body: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const out = matter.stringify(body, data);
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, filePath);
}

/** Append text to a .md (creates if missing). */
export async function appendMd(filePath: string, chunk: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, chunk, 'utf8');
}

/** List .md files in a directory (returns full paths). */
export async function listMd(dirPath: string): Promise<string[]> {
  await fs.mkdir(dirPath, { recursive: true });
  const entries = await fs.readdir(dirPath);
  return entries.filter((f) => f.endsWith('.md')).map((f) => path.join(dirPath, f));
}

/**
 * Extract a fenced JSON block from Markdown body, or null if none found.
 * The first ```json ... ``` block is returned.
 */
export function extractJsonBlock(body: string): unknown | null {
  const match = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]!);
  } catch {
    return null;
  }
}

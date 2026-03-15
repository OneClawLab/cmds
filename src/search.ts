import fuzzysort from 'fuzzysort';
import { spawnCommand } from './os-utils.js';
import type { RuntimeIndex, SearchResult } from './types.js';

/**
 * Build a searchable text string from a command entry by concatenating
 * name, description, and all example descriptions/commands.
 */
function buildSearchText(cmd: { name: string; description: string; examples: Array<{ description: string; command: string }> }): string {
  const parts = [cmd.name, cmd.description];
  for (const ex of cmd.examples) {
    parts.push(ex.description, ex.command);
  }
  return parts.join(' ');
}

/**
 * Fuzzy search against command name + description + examples text.
 * Uses fuzzysort for matching. Returns results sorted by score descending.
 */
export function searchFuzzy(query: string, index: RuntimeIndex, limit: number): SearchResult[] {
  if (!query || index.commands.length === 0) return [];

  const targets = index.commands.map((cmd) => ({
    text: buildSearchText(cmd),
    name: cmd.name,
    description: cmd.description,
    category: cmd.category,
  }));

  const results = fuzzysort.go(query, targets, { key: 'text', limit });

  return results.map((r) => ({
    name: r.obj.name,
    description: r.obj.description,
    score: r.score,
    category: r.obj.category,
  }));
}

/**
 * Search using xdb semantic similarity search.
 * Calls `xdb find cmds --similar --limit <n>` with query piped via stdin.
 * Returns null on any failure so caller can fallback.
 */
export async function searchXdb(query: string, limit: number): Promise<SearchResult[] | null> {
  try {
    const { stdout } = await spawnCommand(
      'xdb',
      ['find', 'cmds', '--similar', '--limit', String(limit), '--json'],
      query,
    );

    // xdb outputs JSONL — one JSON object per line
    const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const results: SearchResult[] = [];
    for (const line of lines) {
      const item = JSON.parse(line) as Record<string, unknown>;
      results.push({
        name: String(item.name ?? ''),
        description: String(item.description ?? ''),
        score: Number(item._score ?? 0),
        category: String(item.category ?? ''),
      });
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

/**
 * Main search function. Prefers xdb semantic search when available, falls back to fuzzysort.
 * Never throws — catches all errors and falls back gracefully.
 * @param minScore - optional minimum score threshold (0–1). Results below this are filtered out.
 */
export async function search(
  query: string,
  index: RuntimeIndex,
  options: { limit: number; minScore?: number },
): Promise<SearchResult[]> {
  try {
    let results: SearchResult[];
    if (index.meta.xdbAvailable) {
      const xdbResults = await searchXdb(query, options.limit);
      results = xdbResults ?? searchFuzzy(query, index, options.limit);
    } else {
      results = searchFuzzy(query, index, options.limit);
    }
    if (options.minScore !== undefined) {
      return results.filter((r) => r.score >= options.minScore!);
    }
    return results;
  } catch {
    return searchFuzzy(query, index, options.limit);
  }
}

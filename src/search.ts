import fuzzysort from 'fuzzysort';
import type { RuntimeIndex, SearchResult } from './types.js';
import { execCommand } from './utils.js';

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
    score: r.score === -Infinity ? 0 : r.score + 1000,
    category: r.obj.category,
  }));
}

/**
 * Search using external VDB (vector database) command.
 * Returns null on any failure so caller can fallback.
 */
export async function searchVdb(query: string, limit: number): Promise<SearchResult[] | null> {
  try {
    const { stdout } = await execCommand('vdb', ['search', '--query', query, '--limit', String(limit), '--json']);
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item: Record<string, unknown>) => ({
      name: String(item.name ?? ''),
      description: String(item.description ?? ''),
      score: Number(item.score ?? 0),
      category: String(item.category ?? ''),
    }));
  } catch {
    return null;
  }
}

/**
 * Main search function. Prefers VDB when available, falls back to fuzzysort.
 * Never throws — catches all errors and falls back gracefully.
 */
export async function search(
  query: string,
  index: RuntimeIndex,
  options: { limit: number },
): Promise<SearchResult[]> {
  try {
    if (index.meta.vdbAvailable) {
      const vdbResults = await searchVdb(query, options.limit);
      if (vdbResults !== null) return vdbResults;
    }
    return searchFuzzy(query, index, options.limit);
  } catch {
    return searchFuzzy(query, index, options.limit);
  }
}

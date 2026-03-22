import fuzzysort from 'fuzzysort';
import { spawnCommand } from './repo-utils/os.js';
import type { RuntimeIndex, SearchResult } from './types.js';

/** Minimum internal fetch size for each engine before RRF merging. */
const RRF_MIN_FETCH = 20;

/** RRF constant — dampens the impact of rank differences. */
const RRF_K = 60;

/** Source weights for RRF — xdb (semantic) is weighted higher than fuzzy. */
const RRF_WEIGHT_XDB = 1.0;
const RRF_WEIGHT_FUZZY = 0.4;

/**
 * Minimum fuzzysort score for a result to participate in RRF when xdb is available.
 * fuzzysort scores are negative (0 = perfect match). Typical range: -1000 ~ 0.
 * Only results above this threshold are included, filtering out weak fuzzy matches.
 */
const FUZZY_SCORE_THRESHOLD = -200;

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
 * Passes query as a positional CLI argument to avoid shell word-splitting on Windows.
 * Returns null on any failure so caller can fallback.
 */
export async function searchXdb(query: string, limit: number): Promise<SearchResult[] | null> {
  try {
    const { stdout } = await spawnCommand(
      'xdb',
      ['find', 'cmds', query, '--similar', '--limit', String(limit), '--json'],
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
 * Merge ranked result lists using weighted Reciprocal Rank Fusion.
 * RRF score = Σ weight_i / (k + rank_i), where rank is 1-based.
 * Each list can carry an independent weight (default 1.0).
 * Final list is sorted by RRF score descending, then trimmed to `limit`.
 */
export function rrfMerge(lists: Array<{ results: SearchResult[]; weight?: number }>, limit: number): SearchResult[] {
  const acc = new Map<string, { rrfScore: number; result: SearchResult }>();

  for (const { results, weight = 1.0 } of lists) {
    results.forEach((item, idx) => {
      const rank = idx + 1;
      const contribution = weight / (RRF_K + rank);
      const existing = acc.get(item.name);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        acc.set(item.name, { rrfScore: contribution, result: item });
      }
    });
  }

  return [...acc.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map((entry) => ({ ...entry.result, score: entry.rrfScore }));
}

/**
 * Main search function.
 * When xdb is available: runs both xdb and fuzzy with at least RRF_MIN_FETCH results each,
 * merges via RRF, then trims to the requested limit.
 * Falls back to fuzzy-only when xdb is unavailable or fails.
 * Never throws.
 */
export async function search(
  query: string,
  index: RuntimeIndex,
  options: { limit: number },
): Promise<SearchResult[]> {
  try {
    if (index.meta.xdbAvailable) {
      const fetchLimit = Math.max(options.limit, RRF_MIN_FETCH);
      const [xdbResults, fuzzyResults] = await Promise.all([
        searchXdb(query, fetchLimit),
        Promise.resolve(searchFuzzy(query, index, fetchLimit)),
      ]);

      if (xdbResults) {
        // Filter out weak fuzzy matches before merging — only keep results
        // above the score threshold to avoid polluting xdb-quality rankings.
        const filteredFuzzy = fuzzyResults.filter((r) => r.score >= FUZZY_SCORE_THRESHOLD);
        return rrfMerge(
          [
            { results: xdbResults, weight: RRF_WEIGHT_XDB },
            { results: filteredFuzzy, weight: RRF_WEIGHT_FUZZY },
          ],
          options.limit,
        );
      }
      // xdb failed — fall through to fuzzy only
      return fuzzyResults.slice(0, options.limit);
    }

    return searchFuzzy(query, index, options.limit);
  } catch {
    return searchFuzzy(query, index, options.limit);
  }
}

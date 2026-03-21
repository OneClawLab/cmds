#!/usr/bin/env npx tsx
/**
 * prepare:categorize — Fill in the category field for tldr index entries.
 *
 * Reads data/tldr-index.json, finds entries with empty or "other" category,
 * sends batches to `pai` for LLM-based categorization, and writes back
 * incrementally after each batch (so interrupted runs can resume).
 *
 * Categories: filesystem, text-processing, search, archive, process,
 *             system, network, shell, other
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCommand } from '../src/repo-utils/os.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(PROJECT_ROOT, 'data', 'tldr-index.json');

const CATEGORIES = [
  'filesystem', 'text-processing', 'search', 'archive',
  'process', 'system', 'network', 'shell', 'other',
] as const;

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

interface TldrEntry {
  name: string;
  description: string;
  category: string;
  examples: Array<{ description: string; command: string }>;
  aliases: string[];
  relatedCommands: string[];
  seeAlso: string[];
  tags: string[];
  platforms: string[];
}

function buildPrompt(entries: TldrEntry[]): string {
  const list = entries
    .map((e) => `- ${e.name}: ${e.description || '(no description)'}`)
    .join('\n');

  return `Categorize each command into exactly one category.

Valid categories: ${CATEGORIES.join(', ')}

Commands:
${list}

Respond with ONLY a JSON object mapping command name to category. Example:
{"tar": "archive", "ls": "filesystem", "curl": "network"}

No explanation, no markdown fences, just the JSON object.`;
}

function parseCategories(output: string): Record<string, string> {
  let json = output.trim();
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1]!.trim();

  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start !== -1 && end !== -1) json = json.slice(start, end + 1);

  const parsed = JSON.parse(json) as Record<string, string>;
  const result: Record<string, string> = {};
  for (const [name, cat] of Object.entries(parsed)) {
    result[name] = CATEGORIES.includes(cat as (typeof CATEGORIES)[number]) ? cat : 'other';
  }
  return result;
}

function runPai(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }> {
  return spawnCommand('pai', args, stdin, 120_000);
}

async function saveIndex(entries: TldrEntry[]): Promise<void> {
  await writeFile(INDEX_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

async function main() {
  const entries = JSON.parse(await readFile(INDEX_PATH, 'utf8')) as TldrEntry[];
  const uncategorized = entries.filter((e) => !e.category);

  console.error(`Total: ${entries.length}, uncategorized: ${uncategorized.length}`);
  if (uncategorized.length === 0) {
    console.error('Nothing to do.');
    return;
  }

  // Check pai
  try {
    await runPai(['--version']);
  } catch {
    console.error('Error: pai not available. Install and configure pai first.');
    process.exit(1);
  }

  const entryMap = new Map(entries.map((e) => [e.name, e]));
  let totalCategorized = 0;

  // Build all batches
  const batches: { batch: TldrEntry[]; batchNum: number }[] = [];
  for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
    batches.push({
      batch: uncategorized.slice(i, i + BATCH_SIZE),
      batchNum: Math.floor(i / BATCH_SIZE) + 1,
    });
  }
  const totalBatches = batches.length;
  let completed = 0;

  // Semaphore for save serialization
  let saving = Promise.resolve();

  async function processBatch(b: { batch: TldrEntry[]; batchNum: number }) {
    console.error(`Batch ${b.batchNum}/${totalBatches} (${b.batch.length} commands)...`);
    const prompt = buildPrompt(b.batch);
    try {
      const { stdout } = await runPai(['chat'], prompt);
      const categories = parseCategories(stdout);
      let batchOk = 0;
      for (const [name, category] of Object.entries(categories)) {
        const entry = entryMap.get(name);
        if (entry) { entry.category = category; batchOk++; }
      }
      totalCategorized += batchOk;
      completed++;
      console.error(`  Batch ${b.batchNum} done (${completed}/${totalBatches}): ${batchOk}/${b.batch.length}`);
    } catch (err) {
      completed++;
      console.error(`  Batch ${b.batchNum} failed (${completed}/${totalBatches}): ${err instanceof Error ? err.message : String(err)}`);
    }
    // Chain saves so they don't interleave
    saving = saving.then(() => saveIndex(entries));
    await saving;
  }

  // Run with concurrency limit
  const pending = new Set<Promise<void>>();
  for (const b of batches) {
    const task = processBatch(b);
    pending.add(task);
    task.finally(() => pending.delete(task));
    if (pending.size >= CONCURRENCY) {
      await Promise.race(pending);
    }
  }
  await Promise.all(pending);

  console.error(`Done: ${totalCategorized} entries categorized via LLM`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { commandExists, execCommand } from './utils.js';
import { saveRuntimeIndex } from './data.js';
import { helpFallback } from './info.js';
import { isEnrichSafe } from './safety.js';
import type {
  TldrIndex,
  CommandEntry,
  RuntimeIndex,
  ScanResult,
} from './types.js';

/**
 * Detect installed executable commands by scanning PATH directories.
 * Returns a deduplicated, sorted list of command names.
 */
export async function detectCommands(): Promise<string[]> {
  const pathEnv = process.env['PATH'] ?? '';
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const dirs = pathEnv.split(delimiter).filter((d) => d.length > 0);

  const seen = new Set<string>();

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() || entry.isSymbolicLink()) {
          // On Windows, strip common executable extensions
          let name = entry.name;
          if (process.platform === 'win32') {
            const ext = path.extname(name).toLowerCase();
            if (['.exe', '.cmd', '.bat', '.com'].includes(ext)) {
              name = path.basename(name, ext);
            } else {
              continue; // skip non-executable files on Windows
            }
          }
          seen.add(name);
        }
      }
    } catch {
      // Directory doesn't exist or not readable — skip
    }
  }

  return [...seen].sort();
}

/**
 * Merge detected commands with the Tldr_Index.
 * Commands found in tldr get source='tldr' with full metadata.
 * Commands not in tldr get source='unknown' with minimal info.
 */
export function mergeWithTldr(
  detectedCommands: string[],
  tldrIndex: TldrIndex,
): CommandEntry[] {
  const tldrMap = new Map(tldrIndex.map((e) => [e.name, e]));

  return detectedCommands.map((name): CommandEntry => {
    const tldr = tldrMap.get(name);
    if (tldr) {
      return {
        name: tldr.name,
        description: tldr.description,
        category: tldr.category,
        examples: tldr.examples,
        source: 'tldr',
        aliases: tldr.aliases,
        tags: tldr.tags,
      };
    }
    return {
      name,
      description: '',
      category: 'other',
      examples: [],
      source: 'unknown',
      aliases: [],
      tags: [],
    };
  });
}

/**
 * Check if the external `xdb` command is available.
 */
export async function checkXdbAvailability(): Promise<boolean> {
  return commandExists('xdb');
}

/**
 * Collection name used in xdb for cmds data.
 */
const XDB_COLLECTION = 'cmds';

/**
 * Initialize the xdb collection for cmds if it doesn't already exist.
 * Uses hybrid/knowledge-base policy for semantic + full-text search.
 * Silently returns false on any failure.
 */
async function ensureXdbCollection(): Promise<boolean> {
  try {
    // Check if collection already exists by listing
    const { stdout } = await execCommand('xdb', ['col', 'list']);
    const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        const info = JSON.parse(line) as { name?: string };
        if (info.name === XDB_COLLECTION) return true;
      } catch { /* skip malformed lines */ }
    }
    // Collection doesn't exist — create it
    await execCommand('xdb', ['col', 'init', XDB_COLLECTION, '--policy', 'hybrid/knowledge-base']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the xdb record content string from a CommandEntry.
 * Concatenates name, description, and example texts for embedding.
 */
function buildXdbContent(cmd: CommandEntry): string {
  const parts = [cmd.name, cmd.description];
  for (const ex of cmd.examples) {
    parts.push(ex.description, ex.command);
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Ingest command entries into xdb collection via batch put.
 * Only ingests commands that have meaningful content (description or examples).
 * Splits into chunks to avoid overwhelming the embedding API.
 * Silently returns on any failure.
 */
async function ingestToXdb(commands: CommandEntry[]): Promise<void> {
  const records = commands
    .filter((cmd) => cmd.description || cmd.examples.length > 0)
    .map((cmd) => ({
      id: cmd.name,
      content: buildXdbContent(cmd),
      name: cmd.name,
      description: cmd.description,
      category: cmd.category,
    }));

  if (records.length === 0) return;

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const BATCH_SIZE = 100;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const jsonl = chunk.map((r) => JSON.stringify(r)).join('\n');

    try {
      const child = execFileAsync('xdb', ['put', XDB_COLLECTION, '--batch'], {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      child.child.stdin?.write(jsonl);
      child.child.stdin?.end();
      await child;
    } catch {
      // Silently fail — xdb ingestion is best-effort
    }
  }
}

/**
 * Main scan function.
 * 1. Detect installed commands via PATH scanning
 * 2. Merge with tldr index
 * 3. If enrich=true, try --help/-h for unknown commands (with safety checks)
 * 4. Check xdb availability
 * 5. Build and save RuntimeIndex
 * 6. Return ScanResult summary
 */
export async function scan(
  tldrIndex: TldrIndex,
  options: { enrich?: boolean; onProgress?: (current: number, total: number, name: string) => void } = {},
): Promise<ScanResult> {
  const detected = await detectCommands();
  const commands = mergeWithTldr(detected, tldrIndex);

  let commandsWithHelp = 0;
  let commandsSkipped = 0;

  if (options.enrich) {
    const unknowns = commands.filter((c) => c.source === 'unknown');
    const total = unknowns.length;
    for (let i = 0; i < unknowns.length; i++) {
      const cmd = unknowns[i]!;
      options.onProgress?.(i + 1, total, cmd.name);

      const safety = await isEnrichSafe(cmd.name);
      if (!safety.safe) {
        commandsSkipped++;
        continue;
      }

      const result = await helpFallback(cmd.name, 3000);
      if (result) {
        cmd.description = result.description;
        cmd.source = 'help';
        commandsWithHelp++;
      }
    }
  }

  const xdbAvailable = await checkXdbAvailability();

  const runtimeIndex: RuntimeIndex = {
    meta: {
      xdbAvailable,
      lastScanTime: new Date().toISOString(),
      systemInfo: {
        platform: process.platform,
        arch: process.arch,
        shell: process.env['SHELL'] ?? process.env['ComSpec'] ?? 'unknown',
      },
    },
    commands,
  };

  await saveRuntimeIndex(runtimeIndex);

  // If xdb is available, initialize collection and ingest data
  if (xdbAvailable) {
    const colReady = await ensureXdbCollection();
    if (colReady) {
      await ingestToXdb(commands);
    }
  }

  return {
    commandsFound: commands.length,
    commandsWithTldr: commands.filter((c) => c.source === 'tldr').length,
    commandsWithHelp,
    commandsSkipped,
    xdbAvailable,
    scanTime: runtimeIndex.meta.lastScanTime,
  };
}

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { commandExists, execCommand } from '../src/os-utils.js'
import { spawnCommand } from './os-utils.js';
import { saveRuntimeIndex, loadRuntimeIndex } from './data.js';
import { helpFallback } from './info.js';
import { isEnrichSafe } from './safety.js';
import type {
  TldrIndex,
  CommandEntry,
  RuntimeIndex,
  ScanResult,
  ScanCommandsResult,
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
      category: 'unknown',
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
    // Check if collection already exists
    const { stdout } = await execCommand('xdb', ['col', 'list', '--json']);
    try {
      const list = JSON.parse(stdout.trim()) as Array<{ name?: string }>;
      if (list.some((entry) => entry.name === XDB_COLLECTION)) return true;
    } catch { /* parse failed — assume not found */ }
    // Collection doesn't exist — create it
    await execCommand('xdb', ['col', 'init', XDB_COLLECTION, '--policy', 'hybrid/knowledge-base']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the xdb record content string from a CommandEntry.
 * Only uses name and description to keep content concise for embedding.
 */
function buildXdbContent(cmd: CommandEntry): string {
  const parts = [cmd.name, cmd.description];
  // Add only first 10 example descriptions (not commands) to keep size manageable
  for (const ex of cmd.examples.slice(0, 10)) {
    if (ex.description) parts.push(ex.description);
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Ingest command entries into xdb collection via batch put.
 * Only ingests commands that have meaningful content (description or examples).
 * Splits into chunks to avoid overwhelming the embedding API.
 * Returns false and writes a warning to stderr on failure.
 */
async function ingestToXdb(commands: CommandEntry[]): Promise<boolean> {
  const records = commands
    .filter((cmd) => cmd.description || cmd.examples.length > 0)
    .map((cmd) => ({
      id: cmd.name,
      content: buildXdbContent(cmd),
      name: cmd.name,
      description: cmd.description,
      category: cmd.category,
    }));

  if (records.length === 0) return true;

  const BATCH_SIZE = 10;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const jsonl = chunk.map((r) => JSON.stringify(r)).join('\n');
    try {
      await spawnCommand('xdb', ['put', XDB_COLLECTION, '--batch'], jsonl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[cmds scan] xdb ingest failed at chunk ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}\n`);
      return false;
    }
  }
  return true;
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

  // Reclassify commands that still have no substantive info into 'unknown' category
  for (const cmd of commands) {
    if (!cmd.description && cmd.examples.length === 0 && cmd.category !== 'unknown') {
      cmd.category = 'unknown';
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
      const ingested = await ingestToXdb(commands);
      if (!ingested) {
        process.stderr.write(
          '[cmds scan] xdb ingest incomplete. Make sure xdb embed is configured:\n' +
          '  xdb config embed --set-provider openai --set-model text-embedding-3-small\n' +
          '  xdb config embed --set-key <apiKey>\n',
        );
      }
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


/**
 * Capture full USAGE output from a command by running --help --verbose,
 * falling back to --help if --verbose produces no output.
 * Returns the raw output string, or null on failure.
 */
async function captureUsage(command: string, timeoutMs = 5000): Promise<string | null> {
  for (const args of [['--help', '--verbose'], ['--help']]) {
    try {
      const { stdout, stderr } = await execCommand(command, args, timeoutMs);
      const output = stdout || stderr;
      if (output && output.trim().length > 0) return output.trim();
    } catch (err) {
      // Many commands write help to stderr and exit non-zero
      if (err && typeof err === 'object' && 'stdout' in err) {
        const e = err as { stdout?: string; stderr?: string };
        const output = e.stdout || e.stderr;
        if (output && output.trim().length > 0) return output.trim();
      }
    }
  }
  return null;
}

/**
 * Incremental scan for specific commands.
 * Runs `<cmd> --help --verbose` (fallback `--help`) to capture USAGE output,
 * then updates the runtime index and xdb incrementally.
 *
 * Requires an existing runtime index (run `cmds scan` first).
 */
export async function scanCommands(
  commandNames: string[],
  options: { onProgress?: (current: number, total: number, name: string) => void } = {},
): Promise<ScanCommandsResult> {
  const index = await loadRuntimeIndex();
  if (!index) {
    throw new Error('No runtime index found. Run `cmds scan` first.');
  }

  const cmdMap = new Map(index.commands.map((c) => [c.name, c]));
  const updated: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < commandNames.length; i++) {
    const name = commandNames[i]!;
    options.onProgress?.(i + 1, commandNames.length, name);

    const usage = await captureUsage(name);
    if (!usage) {
      failed.push(name);
      continue;
    }

    // Update or create entry in the index
    let entry = cmdMap.get(name);
    if (entry) {
      entry.description = usage;
      entry.source = 'help';
    } else {
      entry = {
        name,
        description: usage,
        category: 'unknown',
        examples: [],
        source: 'help',
        aliases: [],
        tags: [],
      };
      index.commands.push(entry);
      cmdMap.set(name, entry);
    }
    updated.push(name);
  }

  // Save updated index
  index.meta.lastScanTime = new Date().toISOString();
  await saveRuntimeIndex(index);

  // Incremental xdb ingest for updated commands only
  let xdbIngested = false;
  if (updated.length > 0 && index.meta.xdbAvailable) {
    const updatedEntries = updated
      .map((n) => cmdMap.get(n))
      .filter((e): e is CommandEntry => e !== undefined);
    const colReady = await ensureXdbCollection();
    if (colReady) {
      xdbIngested = await ingestToXdb(updatedEntries);
    }
  }

  return {
    commands: commandNames,
    updated,
    failed,
    xdbIngested,
  };
}

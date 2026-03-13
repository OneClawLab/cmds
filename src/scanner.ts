import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { commandExists } from './utils.js';
import { saveRuntimeIndex } from './data.js';
import { helpFallback } from './info.js';
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
 * Check if the external `vdb` command is available.
 */
export async function checkVdbAvailability(): Promise<boolean> {
  return commandExists('vdb');
}

const HELP_FALLBACK_LIMIT = 20;

/**
 * Main scan function.
 * 1. Detect installed commands via PATH scanning
 * 2. Merge with tldr index
 * 3. Try --help for a limited batch of unknown commands
 * 4. Check VDB availability
 * 5. Build and save RuntimeIndex
 * 6. Return ScanResult summary
 */
export async function scan(tldrIndex: TldrIndex): Promise<ScanResult> {
  const detected = await detectCommands();
  const commands = mergeWithTldr(detected, tldrIndex);

  // Try --help for a limited number of unknown-source commands
  const unknowns = commands.filter((c) => c.source === 'unknown');
  const batch = unknowns.slice(0, HELP_FALLBACK_LIMIT);
  let commandsWithHelp = 0;

  for (const cmd of batch) {
    const desc = await helpFallback(cmd.name);
    if (desc) {
      cmd.description = desc;
      cmd.source = 'help';
      commandsWithHelp++;
    }
  }

  const vdbAvailable = await checkVdbAvailability();

  const runtimeIndex: RuntimeIndex = {
    meta: {
      vdbAvailable,
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

  return {
    commandsFound: commands.length,
    commandsWithTldr: commands.filter((c) => c.source === 'tldr').length,
    commandsWithHelp,
    vdbAvailable,
    scanTime: runtimeIndex.meta.lastScanTime,
  };
}

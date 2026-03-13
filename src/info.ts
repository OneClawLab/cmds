import { commandExists, execCommand } from './utils.js';
import type { CommandInfo, RuntimeIndex, CommandEntry } from './types.js';

export class CommandNotFoundError extends Error {
  constructor(command: string) {
    super(`Command not found: ${command}`);
    this.name = 'CommandNotFoundError';
  }
}

/**
 * Try running `<command> --help` and extract the first non-empty paragraph.
 * Returns null on any failure.
 */
export async function helpFallback(command: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execCommand(command, ['--help']);
    const output = stdout || stderr;
    if (!output) return null;

    const lines = output.split('\n');
    const paragraphLines: string[] = [];
    let started = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!started) {
        if (trimmed.length > 0) {
          started = true;
          paragraphLines.push(trimmed);
        }
      } else {
        if (trimmed.length === 0) break;
        paragraphLines.push(trimmed);
      }
    }

    const description = paragraphLines.join(' ').trim();
    return description.length > 0 ? description : null;
  } catch {
    return null;
  }
}

function entryToCommandInfo(entry: CommandEntry): CommandInfo {
  const useCases: string[] = [];
  if (entry.category) {
    useCases.push(`${entry.category} operations`);
  }
  for (const tag of entry.tags) {
    useCases.push(tag);
  }

  return {
    name: entry.name,
    description: entry.description,
    useCases,
    examples: entry.examples,
    caveats: [],
  };
}

/**
 * Resolve detailed info for a command.
 * 1. Confirm command exists in PATH — throw CommandNotFoundError if not.
 * 2. Look up in RuntimeIndex — return structured CommandInfo if found.
 * 3. Fall back to --help extraction — return minimal CommandInfo.
 */
export async function resolveInfo(
  command: string,
  index: RuntimeIndex,
): Promise<CommandInfo> {
  const exists = await commandExists(command);
  if (!exists) {
    throw new CommandNotFoundError(command);
  }

  const entry = index.commands.find((c) => c.name === command);
  if (entry) {
    return entryToCommandInfo(entry);
  }

  // Not in index — try --help fallback
  const description = await helpFallback(command);

  return {
    name: command,
    description: description ?? '',
    useCases: [],
    examples: [],
    caveats: [],
  };
}

import { commandExists, execCommand } from './repo-utils/os.js'
import { isHelpLikeOutput } from './safety.js';
import type { CommandInfo, RuntimeIndex, CommandEntry } from './types.js';

export class CommandNotFoundError extends Error {
  constructor(command: string) {
    super(`Command not found: ${command}`);
    this.name = 'CommandNotFoundError';
  }
}

/**
 * Extract the first non-empty paragraph from command output.
 */
function extractFirstParagraph(output: string): string | null {
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

  const result = paragraphLines.join(' ').trim();
  return result.length > 0 ? result : null;
}

/**
 * Capture output from a command, tolerating non-zero exit codes.
 * Many commands write help to stderr and exit non-zero.
 * timeout defaults to 3000ms — callers can override for enrich scenarios.
 */
async function captureOutput(command: string, args: string[], timeoutMs = 3000): Promise<string | null> {
  try {
    const { stdout, stderr } = await execCommand(command, args, timeoutMs);
    return stdout || stderr || null;
  } catch (err) {
    // execCommand throws on non-zero exit — extract output from the error
    if (err && typeof err === 'object' && 'stdout' in err) {
      const e = err as { stdout?: string; stderr?: string };
      return e.stdout || e.stderr || null;
    }
    return null;
  }
}

/**
 * Try running `<command> --help`, then `-h`.
 * No-args execution is intentionally omitted — too many commands have
 * side effects when run without arguments (GUI launch, daemon start, etc.).
 * Output is validated to look like genuine help text before accepting.
 * Returns the first non-empty paragraph found, or null on total failure.
 * timeoutMs applies per attempt.
 */
export async function helpFallback(command: string, timeoutMs = 3000): Promise<{ description: string; rawOutput: string } | null> {
  for (const args of [['--help'], ['-h']]) {
    const output = await captureOutput(command, args, timeoutMs);
    if (!output) continue;
    if (!isHelpLikeOutput(output)) continue;
    const description = extractFirstParagraph(output);
    if (description) return { description, rawOutput: output };
  }
  return null;
}

function hasSubstantiveContent(entry: CommandEntry): boolean {
  return entry.description.trim().length > 0 || entry.examples.length > 0;
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
 * 2. Look up in RuntimeIndex — if found AND has substantive content, return it.
 * 3. Fall back to --help / no-args execution to extract description + raw usage.
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
  if (entry && hasSubstantiveContent(entry)) {
    return entryToCommandInfo(entry);
  }

  // Entry missing or empty — try live --help / no-args fallback
  const fallback = await helpFallback(command);

  // If we have an entry with at least a name, merge fallback description in
  if (entry) {
    const merged = entryToCommandInfo(entry);
    if (fallback) {
      if (!merged.description) merged.description = fallback.description;
      if (merged.examples.length === 0) {
        merged.examples = [{ description: 'Usage output', command: fallback.rawOutput.trim() }];
      }
    }
    return merged;
  }

  return {
    name: command,
    description: fallback?.description ?? '',
    useCases: [],
    examples: fallback ? [{ description: 'Usage output', command: fallback.rawOutput.trim() }] : [],
    caveats: [],
  };
}

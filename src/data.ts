import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { TldrIndex, RuntimeIndex } from './types.js';

/**
 * Get the absolute path to the static tldr-index.json bundled with the package.
 * Resolves relative to the built output: <package-root>/data/tldr-index.json
 */
export function getTldrIndexPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(thisFile);          // dist/
  const packageRoot = path.dirname(distDir);       // package root
  return path.join(packageRoot, 'data', 'tldr-index.json');
}

/**
 * Get the absolute path to the runtime index file.
 * Located at ~/.config/cmds/index.json
 */
export function getRuntimeIndexPath(): string {
  return path.join(os.homedir(), '.config', 'cmds', 'index.json');
}

/**
 * Load the static Tldr_Index from dist/data/tldr-index.json.
 * Throws on any failure (file missing, parse error, etc.).
 */
export async function loadTldrIndex(): Promise<TldrIndex> {
  const filePath = getTldrIndexPath();
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as TldrIndex;
  } catch (err) {
    throw new Error(
      `Failed to load tldr index from ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Load the Runtime_Index from ~/.config/cmds/index.json.
 * Returns null if the file does not exist (ENOENT).
 * Throws a descriptive error for parse failures or other read errors.
 */
export async function loadRuntimeIndex(): Promise<RuntimeIndex | null> {
  const filePath = getRuntimeIndexPath();
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    throw new Error(
      `Failed to read runtime index at ${filePath}: ${err instanceof Error ? err.message : String(err)}. Try running \`cmds scan\` to regenerate it.`
    );
  }

  try {
    return JSON.parse(raw) as RuntimeIndex;
  } catch {
    throw new Error(
      `Runtime index at ${filePath} is corrupted or has invalid format. Please run \`cmds scan\` to regenerate it.`
    );
  }
}

/**
 * Save a RuntimeIndex to ~/.config/cmds/index.json.
 * Creates the directory if it doesn't exist.
 */
export async function saveRuntimeIndex(index: RuntimeIndex): Promise<void> {
  const filePath = getRuntimeIndexPath();
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(index, null, 2), 'utf8');
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

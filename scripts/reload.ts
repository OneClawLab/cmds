#!/usr/bin/env npx tsx
/**
 * prepare:reload — Parse tldr pages/common into dist/data/tldr-index.json
 *
 * Reads Markdown files from ../tldr/pages/common/, extracts structured
 * metadata, and writes a single JSON index file.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TLDR_COMMON = path.resolve(PROJECT_ROOT, '../tldr/pages/common');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'tldr-index.json');

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

function parseTldrMarkdown(content: string, filename: string): TldrEntry | null {
  const lines = content.split('\n');

  // Extract name from first heading
  const headingLine = lines.find((l) => l.startsWith('# '));
  if (!headingLine) return null;
  const name = headingLine.slice(2).trim();

  // Parse > quoted lines
  const quotedLines = lines.filter((l) => l.startsWith('> '));
  const descriptionParts: string[] = [];
  const seeAlso: string[] = [];
  const relatedCommands: string[] = [];

  for (const line of quotedLines) {
    const text = line.slice(2).trim();

    // "See also: `cmd1`, `cmd2`."
    const seeAlsoMatch = text.match(/^See also:\s*(.+)$/i);
    if (seeAlsoMatch) {
      const cmds = seeAlsoMatch[1]!.match(/`([^`]+)`/g);
      if (cmds) {
        for (const c of cmds) {
          const cmdName = c.replace(/`/g, '');
          seeAlso.push(cmdName);
          relatedCommands.push(cmdName);
        }
      }
      continue;
    }

    // "More information: <url>."
    if (/^More information:/i.test(text)) continue;

    // Regular description line
    if (text.length > 0) {
      descriptionParts.push(text);
    }
  }

  const description = descriptionParts.join(' ');

  // Parse examples: pairs of "- description:" and "`command`"
  const examples: Array<{ description: string; command: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('- ')) {
      let exDesc = line.slice(2).trim();
      // Remove trailing colon
      if (exDesc.endsWith(':')) exDesc = exDesc.slice(0, -1).trim();

      // Look for the next backtick-wrapped command line
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        const candidate = lines[j]!.trim();
        if (candidate.startsWith('`') && candidate.endsWith('`')) {
          examples.push({
            description: exDesc,
            command: candidate.slice(1, -1),
          });
          break;
        }
      }
    }
  }

  return {
    name,
    description,
    category: '', // filled by prepare:categorize
    examples,
    aliases: [],
    relatedCommands,
    seeAlso,
    tags: [],
    platforms: ['common'],
  };
}

async function main() {
  console.error(`Reading tldr pages from: ${TLDR_COMMON}`);

  const files = (await readdir(TLDR_COMMON)).filter((f) => f.endsWith('.md'));
  console.error(`Found ${files.length} markdown files`);

  const entries: TldrEntry[] = [];
  let skipped = 0;

  for (const file of files) {
    const content = await readFile(path.join(TLDR_COMMON, file), 'utf8');
    const entry = parseTldrMarkdown(content, file);
    if (entry) {
      entries.push(entry);
    } else {
      skipped++;
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(entries, null, 2), 'utf8');

  const sizeKB = (Buffer.byteLength(JSON.stringify(entries, null, 2)) / 1024).toFixed(1);
  console.error(`Done: ${entries.length} commands indexed, ${skipped} skipped`);
  console.error(`Output: ${OUTPUT_PATH} (${sizeKB} KB)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

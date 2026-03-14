import fc from 'fast-check';
import type {
  TldrEntry,
  CommandEntry,
  RuntimeIndexMeta,
  RuntimeIndex,
  SearchResult,
} from '../../src/types.js';

// --- Predefined categories ---

const CATEGORIES = [
  'filesystem',
  'text-processing',
  'search',
  'archive',
  'process',
  'system',
  'network',
  'shell',
  'other',
] as const;

// --- Primitives ---

/** Realistic CLI command name: lowercase alpha start, then alphanumeric/hyphens, 1-20 chars */
export const arbCommandName = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

/** One of the predefined categories */
export const arbCategory = fc.constantFrom(...CATEGORIES);

/** Non-empty trimmed string for descriptions */
const arbDescription = fc.string({ minLength: 1, maxLength: 120 }).map((s) => {
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : 'default description';
});

// --- Composite generators ---

/** Example entry: { description, command } */
export const arbExample = fc.record({
  description: arbDescription,
  command: arbCommandName.map((name) => `${name} --flag`),
});

/** Full CommandEntry */
export const arbCommandEntry: fc.Arbitrary<CommandEntry> = fc.record({
  name: arbCommandName,
  description: arbDescription,
  category: arbCategory,
  examples: fc.array(arbExample, { minLength: 0, maxLength: 5 }),
  source: fc.constantFrom('tldr' as const, 'help' as const, 'unknown' as const),
  aliases: fc.array(arbCommandName, { minLength: 0, maxLength: 3 }),
  tags: fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 0, maxLength: 4 }),
});

/** Full TldrEntry */
export const arbTldrEntry: fc.Arbitrary<TldrEntry> = fc.record({
  name: arbCommandName,
  description: arbDescription,
  category: arbCategory,
  examples: fc.array(arbExample, { minLength: 0, maxLength: 5 }),
  aliases: fc.array(arbCommandName, { minLength: 0, maxLength: 3 }),
  relatedCommands: fc.array(arbCommandName, { minLength: 0, maxLength: 3 }),
  seeAlso: fc.array(arbCommandName, { minLength: 0, maxLength: 3 }),
  tags: fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 0, maxLength: 4 }),
  platforms: fc.array(fc.constantFrom('linux', 'osx', 'windows', 'sunos'), {
    minLength: 1,
    maxLength: 3,
  }),
});

/** RuntimeIndexMeta with valid ISO timestamp */
export const arbRuntimeIndexMeta: fc.Arbitrary<RuntimeIndexMeta> = fc.record({
  vdbAvailable: fc.boolean(),
  lastScanTime: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) =>
    d.toISOString(),
  ),
  systemInfo: fc.record({
    platform: fc.constantFrom('linux', 'darwin', 'win32'),
    arch: fc.constantFrom('x64', 'arm64'),
    shell: fc.constantFrom('/bin/bash', '/bin/zsh', '/bin/sh', 'powershell.exe'),
  }),
});

/** Full RuntimeIndex: meta + commands array */
export const arbRuntimeIndex: fc.Arbitrary<RuntimeIndex> = fc.record({
  meta: arbRuntimeIndexMeta,
  commands: fc.array(arbCommandEntry, { minLength: 0, maxLength: 20 }),
});

/** SearchResult with positive score */
export const arbSearchResult: fc.Arbitrary<SearchResult> = fc.record({
  name: arbCommandName,
  description: arbDescription,
  score: fc.double({ min: 0.01, max: 1.0, noNaN: true }),
  category: arbCategory,
});

import { describe, it, expect } from 'vitest';
import { searchFuzzy, search } from '../../src/search.js';
import type { RuntimeIndex, CommandEntry } from '../../src/types.js';

function makeCommand(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    name: overrides.name ?? 'test-cmd',
    description: overrides.description ?? 'a test command',
    category: overrides.category ?? 'system',
    examples: overrides.examples ?? [],
    source: 'tldr',
    aliases: [],
    tags: [],
  };
}

function makeIndex(commands: CommandEntry[], vdbAvailable = false): RuntimeIndex {
  return {
    meta: {
      vdbAvailable,
      lastScanTime: new Date().toISOString(),
      systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
    },
    commands,
  };
}

describe('searchFuzzy', () => {
  const commands = [
    makeCommand({ name: 'find', description: 'search for files in a directory hierarchy', category: 'search' }),
    makeCommand({ name: 'grep', description: 'print lines that match patterns', category: 'text-processing' }),
    makeCommand({ name: 'ls', description: 'list directory contents', category: 'filesystem' }),
    makeCommand({ name: 'du', description: 'estimate file space usage', category: 'filesystem' }),
    makeCommand({
      name: 'tar',
      description: 'archive utility',
      category: 'archive',
      examples: [{ description: 'Extract a tar archive', command: 'tar -xf archive.tar' }],
    }),
  ];
  const index = makeIndex(commands);

  it('returns results sorted by score descending', () => {
    const results = searchFuzzy('find', index, 10);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('respects the limit parameter', () => {
    const results = searchFuzzy('file', index, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('matches against command name', () => {
    const results = searchFuzzy('grep', index, 10);
    expect(results.some((r) => r.name === 'grep')).toBe(true);
  });

  it('matches against description text', () => {
    const results = searchFuzzy('archive', index, 10);
    expect(results.some((r) => r.name === 'tar')).toBe(true);
  });

  it('matches against examples text', () => {
    const results = searchFuzzy('Extract', index, 10);
    expect(results.some((r) => r.name === 'tar')).toBe(true);
  });

  it('returns empty array for empty query', () => {
    const results = searchFuzzy('', index, 10);
    expect(results).toEqual([]);
  });

  it('returns empty array for empty index', () => {
    const emptyIndex = makeIndex([]);
    const results = searchFuzzy('find', emptyIndex, 10);
    expect(results).toEqual([]);
  });

  it('returns SearchResult objects with correct shape', () => {
    const results = searchFuzzy('find', index, 10);
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('description');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('category');
      expect(typeof r.score).toBe('number');
    }
  });
});

describe('search', () => {
  const commands = [
    makeCommand({ name: 'find', description: 'search for files', category: 'search' }),
    makeCommand({ name: 'grep', description: 'print lines matching patterns', category: 'text-processing' }),
  ];

  it('falls back to fuzzysort when VDB is unavailable', async () => {
    const index = makeIndex(commands, false);
    const results = await search('find', index, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'find')).toBe(true);
  });

  it('falls back to fuzzysort when VDB is available but fails', async () => {
    // VDB is marked available but the vdb command doesn't exist, so it will fail and fallback
    const index = makeIndex(commands, true);
    const results = await search('find', index, { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'find')).toBe(true);
  });

  it('never throws — returns empty array on worst case', async () => {
    const emptyIndex = makeIndex([], false);
    const results = await search('anything', emptyIndex, { limit: 5 });
    expect(results).toEqual([]);
  });

  it('respects the limit option', async () => {
    const index = makeIndex(commands, false);
    const results = await search('find', index, { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

import { describe, it, expect } from 'vitest';
import type { RuntimeIndex, CommandEntry } from '../../src/types.js';
import { listSummary, listByCategory, CategoryNotFoundError } from '../../src/list.js';

function makeEntry(overrides: Partial<CommandEntry> & { name: string }): CommandEntry {
  return {
    description: `${overrides.name} description`,
    category: 'system',
    examples: [],
    source: 'tldr',
    aliases: [],
    tags: [],
    ...overrides,
  };
}

function makeIndex(commands: CommandEntry[]): RuntimeIndex {
  return {
    meta: {
      vdbAvailable: false,
      lastScanTime: new Date().toISOString(),
      systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
    },
    commands,
  };
}

describe('CategoryNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new CategoryNotFoundError('bogus');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CategoryNotFoundError);
  });

  it('includes the category name in the message', () => {
    const err = new CategoryNotFoundError('bogus');
    expect(err.message).toBe('Category not found: bogus');
    expect(err.name).toBe('CategoryNotFoundError');
  });
});

describe('listSummary', () => {
  it('returns correct totals for a mixed index', () => {
    const index = makeIndex([
      makeEntry({ name: 'ls', category: 'filesystem' }),
      makeEntry({ name: 'cp', category: 'filesystem' }),
      makeEntry({ name: 'grep', category: 'search' }),
      makeEntry({ name: 'ps', category: 'process' }),
    ]);

    const summary = listSummary(index);

    expect(summary.totalCommands).toBe(4);
    expect(summary.totalCategories).toBe(3);
  });

  it('categories match actual data grouping', () => {
    const index = makeIndex([
      makeEntry({ name: 'ls', category: 'filesystem' }),
      makeEntry({ name: 'cp', category: 'filesystem' }),
      makeEntry({ name: 'mv', category: 'filesystem' }),
      makeEntry({ name: 'grep', category: 'search' }),
    ]);

    const summary = listSummary(index);

    const fsCat = summary.categories.find((c) => c.name === 'filesystem');
    expect(fsCat).toBeDefined();
    expect(fsCat!.count).toBe(3);
    expect(fsCat!.representative).toEqual(['ls', 'cp', 'mv']);

    const searchCat = summary.categories.find((c) => c.name === 'search');
    expect(searchCat).toBeDefined();
    expect(searchCat!.count).toBe(1);
    expect(searchCat!.representative).toEqual(['grep']);
  });

  it('limits representative commands to at most 5', () => {
    const commands = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ name: `cmd${i}`, category: 'system' }),
    );
    const index = makeIndex(commands);

    const summary = listSummary(index);
    const sysCat = summary.categories.find((c) => c.name === 'system');
    expect(sysCat!.representative).toHaveLength(5);
  });

  it('returns empty summary for empty index', () => {
    const index = makeIndex([]);
    const summary = listSummary(index);

    expect(summary.totalCommands).toBe(0);
    expect(summary.totalCategories).toBe(0);
    expect(summary.categories).toEqual([]);
  });

  it('treats commands with empty category as "other"', () => {
    const index = makeIndex([
      makeEntry({ name: 'mystery', category: '' }),
    ]);

    const summary = listSummary(index);
    const otherCat = summary.categories.find((c) => c.name === 'other');
    expect(otherCat).toBeDefined();
    expect(otherCat!.count).toBe(1);
  });
});

describe('listByCategory', () => {
  const index = makeIndex([
    makeEntry({ name: 'ls', category: 'filesystem' }),
    makeEntry({ name: 'cp', category: 'filesystem' }),
    makeEntry({ name: 'grep', category: 'search' }),
    makeEntry({ name: 'ps', category: 'process' }),
  ]);

  it('returns only commands matching the category', () => {
    const result = listByCategory(index, 'filesystem');

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.category === 'filesystem')).toBe(true);
    expect(result.map((c) => c.name)).toEqual(['ls', 'cp']);
  });

  it('throws CategoryNotFoundError for invalid category', () => {
    expect(() => listByCategory(index, 'nonexistent')).toThrow(CategoryNotFoundError);
    expect(() => listByCategory(index, 'nonexistent')).toThrow('Category not found: nonexistent');
  });

  it('throws CategoryNotFoundError for valid category with no commands', () => {
    expect(() => listByCategory(index, 'archive')).toThrow(CategoryNotFoundError);
  });

  it('returns all commands for a single-command category', () => {
    const result = listByCategory(index, 'search');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('grep');
  });
});

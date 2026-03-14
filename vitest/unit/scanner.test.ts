import { describe, it, expect } from 'vitest';
import { mergeWithTldr, checkXdbAvailability, detectCommands } from '../../src/scanner.js';
import type { TldrIndex, TldrEntry } from '../../src/types.js';

function makeTldrEntry(overrides: Partial<TldrEntry> & { name: string }): TldrEntry {
  return {
    description: `${overrides.name} description`,
    category: 'filesystem',
    examples: [{ description: 'example', command: `${overrides.name} -a` }],
    aliases: [],
    relatedCommands: [],
    seeAlso: [],
    tags: ['test'],
    platforms: ['linux'],
    ...overrides,
  };
}

describe('scanner', () => {
  describe('mergeWithTldr', () => {
    const tldrIndex: TldrIndex = [
      makeTldrEntry({ name: 'ls', category: 'filesystem', tags: ['filesystem'] }),
      makeTldrEntry({ name: 'grep', category: 'search', tags: ['search'] }),
      makeTldrEntry({ name: 'curl', category: 'network', tags: ['network'] }),
    ];

    it('maps commands found in tldr with source=tldr and metadata', () => {
      const result = mergeWithTldr(['ls', 'grep'], tldrIndex);

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('ls');
      expect(result[0]!.source).toBe('tldr');
      expect(result[0]!.description).toBe('ls description');
      expect(result[0]!.category).toBe('filesystem');
      expect(result[0]!.examples).toHaveLength(1);
      expect(result[0]!.tags).toEqual(['filesystem']);
    });

    it('marks commands not in tldr with source=unknown', () => {
      const result = mergeWithTldr(['myCustomTool', 'anotherTool'], tldrIndex);

      expect(result).toHaveLength(2);
      for (const entry of result) {
        expect(entry.source).toBe('unknown');
        expect(entry.category).toBe('other');
        expect(entry.description).toBe('');
        expect(entry.examples).toEqual([]);
        expect(entry.aliases).toEqual([]);
        expect(entry.tags).toEqual([]);
      }
    });

    it('handles mixed commands (some in tldr, some not)', () => {
      const result = mergeWithTldr(['ls', 'myTool', 'curl'], tldrIndex);

      expect(result).toHaveLength(3);
      expect(result[0]!.source).toBe('tldr');
      expect(result[0]!.name).toBe('ls');
      expect(result[1]!.source).toBe('unknown');
      expect(result[1]!.name).toBe('myTool');
      expect(result[2]!.source).toBe('tldr');
      expect(result[2]!.name).toBe('curl');
    });

    it('returns empty array for empty detected commands', () => {
      const result = mergeWithTldr([], tldrIndex);
      expect(result).toEqual([]);
    });

    it('returns all unknown when tldr index is empty', () => {
      const result = mergeWithTldr(['ls', 'grep'], []);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.source === 'unknown')).toBe(true);
    });

    it('preserves aliases from tldr entries', () => {
      const indexWithAliases: TldrIndex = [
        makeTldrEntry({ name: 'ls', aliases: ['dir', 'vdir'] }),
      ];
      const result = mergeWithTldr(['ls'], indexWithAliases);
      expect(result[0]!.aliases).toEqual(['dir', 'vdir']);
    });
  });

  describe('checkXdbAvailability', () => {
    it('returns a boolean', async () => {
      const result = await checkXdbAvailability();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('detectCommands', () => {
    it('returns a sorted array of strings', async () => {
      const result = await detectCommands();
      expect(Array.isArray(result)).toBe(true);
      // Should be sorted
      const sorted = [...result].sort();
      expect(result).toEqual(sorted);
    });

    it('returns deduplicated entries', async () => {
      const result = await detectCommands();
      const unique = new Set(result);
      expect(result.length).toBe(unique.size);
    });

    it('detects at least some common commands on this system', async () => {
      const result = await detectCommands();
      // On any Unix-like system, we should find at least a few commands
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

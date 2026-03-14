import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { searchFuzzy, search } from '../../src/search.js';
import { arbCommandName, arbRuntimeIndex } from '../helpers/arbitraries.js';

/**
 * Validates: Requirements 2.1, 2.2, 2.3
 */

describe('Property 2: search results sorted by relevance', () => {
  it('Feature: cmds-cli, Property 2: searchFuzzy returns results in descending score order', () => {
    fc.assert(
      fc.property(
        arbCommandName,
        arbRuntimeIndex,
        fc.integer({ min: 1, max: 50 }),
        (query, index, limit) => {
          const results = searchFuzzy(query, index, limit);
          for (let i = 1; i < results.length; i++) {
            expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 3: search results count <= limit', () => {
  it('Feature: cmds-cli, Property 3: search returns at most limit results', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCommandName,
        arbRuntimeIndex.map(idx => ({ ...idx, meta: { ...idx.meta, vdbAvailable: false } })),
        fc.integer({ min: 1, max: 50 }),
        async (query, index, limit) => {
          const results = await search(query, index, { limit });
          expect(results.length).toBeLessThanOrEqual(limit);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements 2.6
 */

describe('Property 4: fuzzy search covers name matches', () => {
  it('Feature: cmds-cli, Property 4: exact name query always appears in searchFuzzy results', () => {
    fc.assert(
      fc.property(
        arbRuntimeIndex.filter(idx => idx.commands.length > 0),
        fc.nat(),
        (index, pickIdx) => {
          const cmd = index.commands[pickIdx % index.commands.length]!;
          const results = searchFuzzy(cmd.name, index, index.commands.length);
          const found = results.some(r => r.name === cmd.name);
          expect(found).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

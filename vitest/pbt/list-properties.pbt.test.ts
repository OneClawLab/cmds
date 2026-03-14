import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { listSummary, listByCategory } from '../../src/list.js';
import { arbRuntimeIndex, arbCategory } from '../helpers/arbitraries.js';

/**
 * Validates: Requirements 4.1, 4.2
 */

describe('Property 6: category filtering correctness', () => {
  it('Feature: cmds-cli, Property 6: listByCategory returns only commands matching the category', () => {
    fc.assert(
      fc.property(arbRuntimeIndex, arbCategory, (index, category) => {
        // Only test when the category has commands (otherwise CategoryNotFoundError is expected)
        const hasCommands = index.commands.some((c) => c.category === category);
        if (!hasCommands) return; // skip — CategoryNotFoundError is correct behavior

        const results = listByCategory(index, category);
        for (const cmd of results) {
          expect(cmd.category).toBe(category);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: summary overview consistency', () => {
  it('Feature: cmds-cli, Property 7: totalCommands equals sum of category counts, totalCategories equals categories length', () => {
    fc.assert(
      fc.property(arbRuntimeIndex, (index) => {
        const summary = listSummary(index);

        const sumOfCounts = summary.categories.reduce((acc, cat) => acc + cat.count, 0);
        expect(summary.totalCommands).toBe(sumOfCounts);
        expect(summary.totalCategories).toBe(summary.categories.length);
      }),
      { numRuns: 100 },
    );
  });
});

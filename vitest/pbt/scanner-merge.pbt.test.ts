import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mergeWithTldr } from '../../src/scanner.js';
import { arbCommandName, arbTldrEntry } from '../helpers/arbitraries.js';

/**
 * **Validates: Requirements 5.2**
 */
describe('Property 8: Tldr index merge correctness', () => {
  it('Feature: cmds-cli, Property 8: commands in tldr get source=tldr, others get source=unknown', () => {
    fc.assert(
      fc.property(
        fc.array(arbCommandName, { minLength: 0, maxLength: 20 }),
        fc.array(arbTldrEntry, { minLength: 0, maxLength: 20 }),
        (detectedCommands, tldrIndex) => {
          const tldrNames = new Set(tldrIndex.map(e => e.name));
          const result = mergeWithTldr(detectedCommands, tldrIndex);

          expect(result).toHaveLength(detectedCommands.length);

          for (const entry of result) {
            if (tldrNames.has(entry.name)) {
              expect(entry.source).toBe('tldr');
              // Should have metadata from tldr
              const tldrEntry = tldrIndex.find(t => t.name === entry.name)!;
              expect(entry.description).toBe(tldrEntry.description);
              expect(entry.category).toBe(tldrEntry.category);
            } else {
              expect(['help', 'unknown']).toContain(entry.source);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

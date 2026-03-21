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
          // Use Map to match mergeWithTldr's dedup behavior (last entry wins on duplicate names)
          const tldrMap = new Map(tldrIndex.map(e => [e.name, e]));
          const result = mergeWithTldr(detectedCommands, tldrIndex);

          expect(result).toHaveLength(detectedCommands.length);

          for (const entry of result) {
            const tldrEntry = tldrMap.get(entry.name);
            if (tldrEntry) {
              expect(entry.source).toBe('tldr');
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

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { arbRuntimeIndex } from '../helpers/arbitraries.js';

describe('Property 9: Runtime Index round-trip', () => {
  /**
   * **Validates: Requirements 5.5, 7.4**
   */
  it('Feature: cmds-cli, Property 9: serializing to JSON then deserializing produces equivalent object', () => {
    fc.assert(
      fc.property(arbRuntimeIndex, (index) => {
        const serialized = JSON.stringify(index);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(index);
      }),
      { numRuns: 100 }
    );
  });
});

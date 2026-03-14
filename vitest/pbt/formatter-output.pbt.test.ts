import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldOutputJson } from '../../src/formatter.js';

describe('Property 10: output format decision correctness', () => {
  /**
   * Validates: Requirements 6.1, 6.2, 6.3
   *
   * For any boolean values explicitJson and isTTY,
   * shouldOutputJson(explicitJson, isTTY) returns true
   * if and only if explicitJson === true or isTTY === false.
   */
  it('Feature: cmds-cli, Property 10: shouldOutputJson returns true iff explicitJson or not TTY', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (explicitJson, tty) => {
        const original = process.stdout.isTTY;
        try {
          Object.defineProperty(process.stdout, 'isTTY', {
            value: tty,
            writable: true,
            configurable: true,
          });
          const result = shouldOutputJson(explicitJson);
          const expected = explicitJson || !tty;
          expect(result).toBe(expected);
        } finally {
          Object.defineProperty(process.stdout, 'isTTY', {
            value: original,
            writable: true,
            configurable: true,
          });
        }
      }),
      { numRuns: 100 },
    );
  });
});

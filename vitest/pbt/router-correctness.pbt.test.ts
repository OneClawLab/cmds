import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { routeQuery } from '../../src/router.js';
import { arbRuntimeIndex, arbCommandName } from '../helpers/arbitraries.js';

/**
 * Property 1: 智能路由正确性
 * Validates: Requirements 1.1, 1.2
 */
describe('Property 1: router correctness', () => {
  it('Feature: cmds-cli, Property 1: routes to info when query matches a command name', () => {
    fc.assert(
      fc.property(
        arbRuntimeIndex.filter((idx) => idx.commands.length > 0),
        fc.nat(),
        (index, pickIdx) => {
          const cmd = index.commands[pickIdx % index.commands.length]!;
          const result = routeQuery(cmd.name, index);
          expect(result.type).toBe('info');
          expect(result.query).toBe(cmd.name);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Feature: cmds-cli, Property 1: routes to search when query does not match any command', () => {
    fc.assert(
      fc.property(arbRuntimeIndex, arbCommandName, (index, query) => {
        const isKnown = index.commands.some((c) => c.name === query);
        const result = routeQuery(query, index);
        if (isKnown) {
          expect(result.type).toBe('info');
        } else {
          expect(result.type).toBe('search');
        }
        expect(result.query).toBe(query);
      }),
      { numRuns: 100 }
    );
  });
});

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { routeQuery } from '../router.js';
import type { RuntimeIndex } from '../types.js';
import { arbRuntimeIndex, arbCommandName } from './helpers/arbitraries.js';

function makeIndex(commandNames: string[]): RuntimeIndex {
  return {
    meta: {
      vdbAvailable: false,
      lastScanTime: new Date().toISOString(),
      systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
    },
    commands: commandNames.map((name) => ({
      name,
      description: `${name} command`,
      category: 'system',
      examples: [],
      source: 'tldr' as const,
      aliases: [],
      tags: [],
    })),
  };
}

describe('routeQuery', () => {
  const index = makeIndex(['ls', 'grep', 'find', 'cat']);

  it('routes to info when query exactly matches a command name', () => {
    const result = routeQuery('ls', index);
    expect(result).toEqual({ type: 'info', query: 'ls' });
  });

  it('routes to search when query does not match any command name', () => {
    const result = routeQuery('find large files', index);
    expect(result).toEqual({ type: 'search', query: 'find large files' });
  });

  it('routes to search with an empty index', () => {
    const emptyIndex = makeIndex([]);
    const result = routeQuery('ls', emptyIndex);
    expect(result).toEqual({ type: 'search', query: 'ls' });
  });

  it('is case-sensitive — "LS" does not match "ls"', () => {
    const result = routeQuery('LS', index);
    expect(result).toEqual({ type: 'search', query: 'LS' });
  });

  it('preserves the original query string in the result', () => {
    const result = routeQuery('grep', index);
    expect(result.query).toBe('grep');
  });

  it('does not match partial command names', () => {
    const result = routeQuery('gre', index);
    expect(result).toEqual({ type: 'search', query: 'gre' });
  });
});

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

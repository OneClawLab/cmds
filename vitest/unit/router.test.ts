import { describe, it, expect } from 'vitest';
import { routeQuery } from '../../src/router.js';
import type { RuntimeIndex } from '../../src/types.js';

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

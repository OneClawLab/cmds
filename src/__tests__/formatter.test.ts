import { describe, it, expect } from 'vitest';
import {
  format,
  formatSearchResults,
  formatCommandInfo,
  formatListSummary,
  formatCategoryList,
  formatScanResult,
  shouldOutputJson,
} from '../formatter.js';
import type {
  SearchResult,
  CommandInfo,
  ListSummary,
  CommandEntry,
  ScanResult,
} from '../types.js';

describe('shouldOutputJson', () => {
  it('returns true when explicitJson is true', () => {
    expect(shouldOutputJson(true)).toBe(true);
  });
});

describe('format', () => {
  it('returns JSON when json option is true', () => {
    const data: SearchResult[] = [
      { name: 'find', description: 'search files', score: 0.9, category: 'search' },
    ];
    const result = format(data, { json: true });
    expect(JSON.parse(result)).toEqual(data);
  });

  it('dispatches SearchResult[] to formatSearchResults', () => {
    const data: SearchResult[] = [
      { name: 'find', description: 'search files', score: 0.9, category: 'search' },
    ];
    const result = format(data, { json: false });
    expect(result).toContain('find');
    expect(result).toContain('Score: 0.9');
  });

  it('dispatches CommandInfo to formatCommandInfo', () => {
    const data: CommandInfo = {
      name: 'ls',
      description: 'list directory',
      useCases: ['list files'],
      examples: [{ description: 'list all', command: 'ls -la' }],
      caveats: ['hidden files need -a'],
    };
    const result = format(data, { json: false });
    expect(result).toContain('## ls');
    expect(result).toContain('ls -la');
  });

  it('dispatches ListSummary to formatListSummary', () => {
    const data: ListSummary = {
      totalCategories: 1,
      totalCommands: 2,
      categories: [{ name: 'search', count: 2, representative: ['find', 'grep'] }],
    };
    const result = format(data, { json: false });
    expect(result).toContain('2 commands in 1 categories');
  });

  it('dispatches CommandEntry[] to formatCategoryList', () => {
    const data: CommandEntry[] = [
      {
        name: 'find',
        description: 'search files',
        category: 'search',
        examples: [],
        source: 'tldr',
        aliases: [],
        tags: [],
      },
    ];
    const result = format(data, { json: false });
    expect(result).toContain('**find**');
  });

  it('dispatches ScanResult to formatScanResult', () => {
    const data: ScanResult = {
      commandsFound: 100,
      commandsWithTldr: 80,
      commandsWithHelp: 15,
      vdbAvailable: true,
      scanTime: '2024-01-01T00:00:00Z',
    };
    const result = format(data, { json: false });
    expect(result).toContain('Commands found: 100');
    expect(result).toContain('VDB available: yes');
  });

  it('handles empty array', () => {
    const result = format([], { json: false });
    expect(result).toContain('No results found');
  });
});

describe('formatSearchResults', () => {
  it('formats numbered list with name, description, score, category', () => {
    const results: SearchResult[] = [
      { name: 'find', description: 'search for files', score: 0.95, category: 'search' },
      { name: 'grep', description: 'search text', score: 0.8, category: 'text-processing' },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain('1. **find**');
    expect(output).toContain('2. **grep**');
    expect(output).toContain('Category: search | Score: 0.95');
    expect(output).toContain('Category: text-processing | Score: 0.8');
  });

  it('returns no results message for empty array', () => {
    expect(formatSearchResults([])).toBe('No results found.');
  });
});

describe('formatCommandInfo', () => {
  it('includes all sections', () => {
    const info: CommandInfo = {
      name: 'tar',
      description: 'archive utility',
      useCases: ['compress files', 'extract archives'],
      examples: [
        { description: 'Create archive', command: 'tar -czf archive.tar.gz dir/' },
      ],
      caveats: ['GNU tar differs from BSD tar'],
    };
    const output = formatCommandInfo(info);
    expect(output).toContain('## tar');
    expect(output).toContain('archive utility');
    expect(output).toContain('### Use Cases');
    expect(output).toContain('- compress files');
    expect(output).toContain('### Examples');
    expect(output).toContain('```');
    expect(output).toContain('tar -czf archive.tar.gz dir/');
    expect(output).toContain('### Caveats');
    expect(output).toContain('- GNU tar differs from BSD tar');
  });

  it('omits empty sections', () => {
    const info: CommandInfo = {
      name: 'echo',
      description: 'display text',
      useCases: [],
      examples: [],
      caveats: [],
    };
    const output = formatCommandInfo(info);
    expect(output).toContain('## echo');
    expect(output).not.toContain('### Use Cases');
    expect(output).not.toContain('### Examples');
    expect(output).not.toContain('### Caveats');
  });
});

describe('formatListSummary', () => {
  it('shows total stats and categories', () => {
    const summary: ListSummary = {
      totalCategories: 2,
      totalCommands: 10,
      categories: [
        { name: 'filesystem', count: 6, representative: ['ls', 'cp', 'mv'] },
        { name: 'network', count: 4, representative: ['curl', 'wget'] },
      ],
    };
    const output = formatListSummary(summary);
    expect(output).toContain('10 commands in 2 categories');
    expect(output).toContain('### filesystem (6)');
    expect(output).toContain('ls, cp, mv');
    expect(output).toContain('### network (4)');
    expect(output).toContain('curl, wget');
  });
});

describe('formatCategoryList', () => {
  it('lists commands with name and description', () => {
    const cmds: CommandEntry[] = [
      { name: 'ls', description: 'list files', category: 'filesystem', examples: [], source: 'tldr', aliases: [], tags: [] },
      { name: 'cp', description: 'copy files', category: 'filesystem', examples: [], source: 'tldr', aliases: [], tags: [] },
    ];
    const output = formatCategoryList(cmds);
    expect(output).toContain('- **ls** — list files');
    expect(output).toContain('- **cp** — copy files');
  });

  it('returns no commands message for empty array', () => {
    expect(formatCategoryList([])).toBe('No commands found.');
  });
});

describe('formatScanResult', () => {
  it('shows all scan stats', () => {
    const result: ScanResult = {
      commandsFound: 50,
      commandsWithTldr: 40,
      commandsWithHelp: 8,
      vdbAvailable: false,
      scanTime: '2024-06-01T12:00:00Z',
    };
    const output = formatScanResult(result);
    expect(output).toContain('## Scan Complete');
    expect(output).toContain('Commands found: 50');
    expect(output).toContain('With tldr data: 40');
    expect(output).toContain('With help text: 8');
    expect(output).toContain('VDB available: no');
    expect(output).toContain('Scan time: 2024-06-01T12:00:00Z');
  });
});

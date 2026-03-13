import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeIndex } from '../types.js';

// Mock utils before importing info module
vi.mock('../utils.js', () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
}));

import { resolveInfo, helpFallback, CommandNotFoundError } from '../info.js';
import { commandExists, execCommand } from '../utils.js';

const mockedCommandExists = vi.mocked(commandExists);
const mockedExecCommand = vi.mocked(execCommand);

function makeIndex(commands: Array<{ name: string; description: string; category?: string; tags?: string[] }>): RuntimeIndex {
  return {
    meta: {
      vdbAvailable: false,
      lastScanTime: new Date().toISOString(),
      systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
    },
    commands: commands.map((c) => ({
      name: c.name,
      description: c.description,
      category: c.category ?? 'system',
      examples: [{ description: `Run ${c.name}`, command: c.name }],
      source: 'tldr' as const,
      aliases: [],
      tags: c.tags ?? [],
    })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CommandNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new CommandNotFoundError('foo');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CommandNotFoundError);
  });

  it('includes the command name in the message', () => {
    const err = new CommandNotFoundError('nonexistent');
    expect(err.message).toBe('Command not found: nonexistent');
    expect(err.name).toBe('CommandNotFoundError');
  });
});

describe('resolveInfo', () => {
  it('returns structured CommandInfo when command is in the index', async () => {
    mockedCommandExists.mockResolvedValue(true);
    const index = makeIndex([
      { name: 'find', description: 'Search for files', category: 'search', tags: ['filesystem'] },
    ]);

    const info = await resolveInfo('find', index);

    expect(info.name).toBe('find');
    expect(info.description).toBe('Search for files');
    expect(info.useCases).toContain('search operations');
    expect(info.useCases).toContain('filesystem');
    expect(info.examples).toHaveLength(1);
    expect(info.caveats).toEqual([]);
  });

  it('throws CommandNotFoundError when command does not exist in PATH', async () => {
    mockedCommandExists.mockResolvedValue(false);
    const index = makeIndex([]);

    await expect(resolveInfo('nonexistent', index)).rejects.toThrow(CommandNotFoundError);
    await expect(resolveInfo('nonexistent', index)).rejects.toThrow('Command not found: nonexistent');
  });

  it('falls back to --help when command exists in PATH but not in index', async () => {
    mockedCommandExists.mockResolvedValue(true);
    mockedExecCommand.mockResolvedValue({ stdout: 'A useful tool\nfor doing things\n\nUsage: tool [opts]', stderr: '' });
    const index = makeIndex([]);

    const info = await resolveInfo('sometool', index);

    expect(info.name).toBe('sometool');
    expect(info.description).toBe('A useful tool for doing things');
    expect(info.useCases).toEqual([]);
    expect(info.examples).toEqual([]);
    expect(info.caveats).toEqual([]);
  });

  it('returns empty description when --help fallback also fails', async () => {
    mockedCommandExists.mockResolvedValue(true);
    mockedExecCommand.mockRejectedValue(new Error('exec failed'));
    const index = makeIndex([]);

    const info = await resolveInfo('sometool', index);

    expect(info.name).toBe('sometool');
    expect(info.description).toBe('');
  });

  it('returns CommandInfo with all required fields', async () => {
    mockedCommandExists.mockResolvedValue(true);
    const index = makeIndex([
      { name: 'ls', description: 'List directory contents', category: 'filesystem', tags: ['list', 'directory'] },
    ]);

    const info = await resolveInfo('ls', index);

    expect(info).toHaveProperty('name');
    expect(info).toHaveProperty('description');
    expect(info).toHaveProperty('useCases');
    expect(info).toHaveProperty('examples');
    expect(info).toHaveProperty('caveats');
    expect(typeof info.name).toBe('string');
    expect(typeof info.description).toBe('string');
    expect(Array.isArray(info.useCases)).toBe(true);
    expect(Array.isArray(info.examples)).toBe(true);
    expect(Array.isArray(info.caveats)).toBe(true);
  });
});

describe('helpFallback', () => {
  it('extracts first paragraph from --help output', async () => {
    mockedExecCommand.mockResolvedValue({
      stdout: 'This is a tool\nthat does things\n\nUsage: tool [options]',
      stderr: '',
    });

    const result = await helpFallback('sometool');
    expect(result).toBe('This is a tool that does things');
  });

  it('returns null when command execution fails', async () => {
    mockedExecCommand.mockRejectedValue(new Error('command not found'));

    const result = await helpFallback('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when output is empty', async () => {
    mockedExecCommand.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await helpFallback('emptytool');
    expect(result).toBeNull();
  });

  it('skips leading blank lines', async () => {
    mockedExecCommand.mockResolvedValue({
      stdout: '\n\n  \nActual description here\n\nMore stuff',
      stderr: '',
    });

    const result = await helpFallback('tool');
    expect(result).toBe('Actual description here');
  });

  it('falls back to stderr when stdout is empty', async () => {
    mockedExecCommand.mockResolvedValue({
      stdout: '',
      stderr: 'Help from stderr\n\nUsage info',
    });

    const result = await helpFallback('tool');
    expect(result).toBe('Help from stderr');
  });
});

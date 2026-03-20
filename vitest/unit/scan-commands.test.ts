import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuntimeIndex, CommandEntry } from '../../src/types.js';

// Mock dependencies before importing scanner
vi.mock('../../src/os-utils.js', () => ({
  commandExists: vi.fn(),
  execCommand: vi.fn(),
  spawnCommand: vi.fn(),
}));

vi.mock('../../src/data.js', () => ({
  loadRuntimeIndex: vi.fn(),
  saveRuntimeIndex: vi.fn(),
  loadTldrIndex: vi.fn(),
  getTldrIndexPath: vi.fn(),
  getRuntimeIndexPath: vi.fn(),
}));

import { scanCommands } from '../../src/scanner.js';
import { execCommand, commandExists, spawnCommand } from '../../src/os-utils.js';
import { loadRuntimeIndex, saveRuntimeIndex } from '../../src/data.js';

const mockedExecCommand = vi.mocked(execCommand);
const mockedCommandExists = vi.mocked(commandExists);
const mockedSpawnCommand = vi.mocked(spawnCommand);
const mockedLoadRuntimeIndex = vi.mocked(loadRuntimeIndex);
const mockedSaveRuntimeIndex = vi.mocked(saveRuntimeIndex);

function makeIndex(commands: CommandEntry[]): RuntimeIndex {
  return {
    meta: {
      xdbAvailable: false,
      lastScanTime: '2026-01-01T00:00:00Z',
      systemInfo: { platform: 'linux', arch: 'x64', shell: '/bin/bash' },
    },
    commands,
  };
}

function makeEntry(name: string, overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    name,
    description: '',
    category: 'unknown',
    examples: [],
    source: 'unknown',
    aliases: [],
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedSaveRuntimeIndex.mockResolvedValue(undefined);
});

describe('scanCommands', () => {
  it('throws when no runtime index exists', async () => {
    mockedLoadRuntimeIndex.mockResolvedValue(null);
    await expect(scanCommands(['pai'])).rejects.toThrow('No runtime index found');
  });

  it('updates existing entry with --help --verbose output', async () => {
    const entry = makeEntry('pai', { description: 'old desc', source: 'tldr' });
    const index = makeIndex([entry]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({
      stdout: 'pai - LLM interaction layer\n\nUsage: pai chat [options]',
      stderr: '',
    });

    const result = await scanCommands(['pai']);

    expect(result.updated).toEqual(['pai']);
    expect(result.failed).toEqual([]);
    // Entry should be mutated in-place
    expect(entry.description).toBe('pai - LLM interaction layer\n\nUsage: pai chat [options]');
    expect(entry.source).toBe('help');
    expect(mockedSaveRuntimeIndex).toHaveBeenCalledOnce();
  });

  it('creates new entry when command not in index', async () => {
    const index = makeIndex([]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({
      stdout: 'newcmd - does stuff\n\nUsage: newcmd [args]',
      stderr: '',
    });

    const result = await scanCommands(['newcmd']);

    expect(result.updated).toEqual(['newcmd']);
    expect(index.commands).toHaveLength(1);
    expect(index.commands[0]!.name).toBe('newcmd');
    expect(index.commands[0]!.source).toBe('help');
    expect(index.commands[0]!.category).toBe('unknown');
  });

  it('falls back to --help when --help --verbose fails', async () => {
    const index = makeIndex([makeEntry('mytool')]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);

    // First call (--help --verbose) fails, second (--help) succeeds
    mockedExecCommand
      .mockRejectedValueOnce(new Error('unknown flag --verbose'))
      .mockResolvedValueOnce({ stdout: 'mytool usage info\n\nOptions: --json', stderr: '' });

    const result = await scanCommands(['mytool']);

    expect(result.updated).toEqual(['mytool']);
    expect(mockedExecCommand).toHaveBeenCalledTimes(2);
    expect(mockedExecCommand).toHaveBeenNthCalledWith(1, 'mytool', ['--help', '--verbose'], 5000);
    expect(mockedExecCommand).toHaveBeenNthCalledWith(2, 'mytool', ['--help'], 5000);
  });

  it('marks command as failed when all help attempts fail', async () => {
    const index = makeIndex([makeEntry('broken')]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockRejectedValue(new Error('command failed'));

    const result = await scanCommands(['broken']);

    expect(result.updated).toEqual([]);
    expect(result.failed).toEqual(['broken']);
  });

  it('handles mixed success and failure', async () => {
    const index = makeIndex([makeEntry('good'), makeEntry('bad')]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);

    mockedExecCommand
      // good: --help --verbose succeeds
      .mockResolvedValueOnce({ stdout: 'good tool help output', stderr: '' })
      // bad: --help --verbose fails
      .mockRejectedValueOnce(new Error('fail'))
      // bad: --help also fails
      .mockRejectedValueOnce(new Error('fail'));

    const result = await scanCommands(['good', 'bad']);

    expect(result.updated).toEqual(['good']);
    expect(result.failed).toEqual(['bad']);
    expect(result.commands).toEqual(['good', 'bad']);
  });

  it('extracts output from stderr when stdout is empty', async () => {
    const entry = makeEntry('stderrtool');
    const index = makeIndex([entry]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({
      stdout: '',
      stderr: 'stderrtool - help from stderr\n\nUsage: stderrtool [opts]',
    });

    const result = await scanCommands(['stderrtool']);

    expect(result.updated).toEqual(['stderrtool']);
    expect(entry.description).toBe('stderrtool - help from stderr\n\nUsage: stderrtool [opts]');
  });

  it('extracts output from error object on non-zero exit', async () => {
    const entry = makeEntry('nonzero');
    const index = makeIndex([entry]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);

    const err = Object.assign(new Error('exit 1'), {
      stdout: 'nonzero help text\n\nOptions: --flag',
      stderr: '',
    });
    mockedExecCommand.mockRejectedValue(err);

    const result = await scanCommands(['nonzero']);

    expect(result.updated).toEqual(['nonzero']);
    expect(entry.description).toBe('nonzero help text\n\nOptions: --flag');
  });

  it('calls onProgress callback', async () => {
    const index = makeIndex([makeEntry('a'), makeEntry('b')]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({ stdout: 'help text', stderr: '' });

    const progress: Array<[number, number, string]> = [];
    await scanCommands(['a', 'b'], {
      onProgress: (cur, total, name) => progress.push([cur, total, name]),
    });

    expect(progress).toEqual([
      [1, 2, 'a'],
      [2, 2, 'b'],
    ]);
  });

  it('does not attempt xdb ingest when xdbAvailable is false', async () => {
    const index = makeIndex([makeEntry('tool')]);
    index.meta.xdbAvailable = false;
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({ stdout: 'tool help', stderr: '' });

    const result = await scanCommands(['tool']);

    expect(result.xdbIngested).toBe(false);
    // spawnCommand (used by ingestToXdb) should not be called
    expect(mockedSpawnCommand).not.toHaveBeenCalled();
  });

  it('attempts xdb ingest when xdbAvailable is true', async () => {
    const index = makeIndex([makeEntry('tool')]);
    index.meta.xdbAvailable = true;
    mockedLoadRuntimeIndex.mockResolvedValue(index);

    // captureUsage: --help --verbose succeeds
    mockedExecCommand
      .mockResolvedValueOnce({ stdout: 'tool help text', stderr: '' })
      // ensureXdbCollection: col list
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ name: 'cmds' }]), stderr: '' });
    // ingestToXdb: xdb put batch
    mockedSpawnCommand.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await scanCommands(['tool']);

    expect(result.xdbIngested).toBe(true);
    expect(mockedSpawnCommand).toHaveBeenCalled();
  });

  it('updates lastScanTime in saved index', async () => {
    const index = makeIndex([makeEntry('tool')]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({ stdout: 'help', stderr: '' });

    await scanCommands(['tool']);

    expect(mockedSaveRuntimeIndex).toHaveBeenCalledOnce();
    const savedIndex = mockedSaveRuntimeIndex.mock.calls[0]![0] as RuntimeIndex;
    // lastScanTime should be updated (not the original value)
    expect(savedIndex.meta.lastScanTime).not.toBe('2026-01-01T00:00:00Z');
  });

  it('trims whitespace from captured output', async () => {
    const entry = makeEntry('spacey');
    const index = makeIndex([entry]);
    mockedLoadRuntimeIndex.mockResolvedValue(index);
    mockedExecCommand.mockResolvedValue({
      stdout: '  \n  spacey help text  \n  ',
      stderr: '',
    });

    await scanCommands(['spacey']);

    expect(entry.description).toBe('spacey help text');
  });
});

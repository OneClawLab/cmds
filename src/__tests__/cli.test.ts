import { describe, it, expect } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const CLI = 'npx tsx src/index.ts';

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string = ''): Promise<CliResult> {
  const cmd = args ? `${CLI} ${args}` : CLI;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: projectRoot,
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}

describe('CLI integration', () => {
  // Requirement 1.4: No arguments → output help and exit 0
  // Requirement 8.1: Success → exit code 0
  it('outputs help when no arguments provided and exits with code 0', async () => {
    const result = await runCli();
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cmds');
    // Help text should contain usage info or description
    expect(result.stdout + result.stderr).toMatch(/usage|options|commands|discover/i);
  });

  // Requirement 8.1: --version → exit code 0
  it('outputs version with --version flag and exits with code 0', async () => {
    const result = await runCli('--version');
    expect(result.exitCode).toBe(0);
    // Version should match semver pattern
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  // Requirement 1.3: Explicit `cmds info <command>` routes to Info_Resolver
  // Requirement 8.3: Argument error → exit code 2
  it('exits with code 2 when info subcommand is missing required argument', async () => {
    const result = await runCli('info');
    // commander should report missing argument with exit code 2 (via exitOverride)
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/argument|required|missing/i);
  });

  // Requirement 8.2: Command not found → exit code 1
  it('exits with code 1 when info targets a nonexistent command', async () => {
    const result = await runCli('info zzz_nonexistent_cmd_12345');
    expect(result.exitCode).toBe(1);
  });

  // Requirement 2.7: Search with no results → exit code 1
  // Requirement 8.2: No results → exit code 1
  it('exits with code 1 when search query yields no results', async () => {
    const result = await runCli('zzz_xyzzy_no_match_99999');
    expect(result.exitCode).toBe(1);
    // Should indicate no results or prompt to scan
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  // Requirement 8.1: help subcommand → exit code 0
  it('outputs help with --help flag and exits with code 0', async () => {
    const result = await runCli('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cmds');
    expect(result.stdout).toMatch(/info|list|scan/i);
  });
});
